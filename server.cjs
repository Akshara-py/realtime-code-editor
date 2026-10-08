const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const axios = require("axios");
const vm = require("vm");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PISTON_URL = "https://emkc.org/api/v2/piston/execute";

const supportedLanguages = {
  javascript: { piston: "javascript", fileName: "main.js" },
  python: { piston: "python", fileName: "main.py" }
};

function formatValue(value) {
  try {
    if (typeof value === "object" && value !== null) {
      return JSON.stringify(value);
    }
    return String(value);
  } catch (error) {
    return String(value);
  }
}

function runJavaScriptLocally(code) {
  const lines = [];

  const sandboxConsole = {
    log: (...args) => lines.push(args.map(formatValue).join(" ")),
    info: (...args) => lines.push(args.map(formatValue).join(" ")),
    warn: (...args) => lines.push(args.map(formatValue).join(" ")),
    error: (...args) => lines.push(args.map(formatValue).join(" "))
  };

  const context = vm.createContext({ console: sandboxConsole });

  vm.runInContext(code, context, { timeout: 5000 });

  return lines.join("\n");
}

app.post("/run", async (req, res) => {
  const { language = "javascript", code = "" } = req.body;

  const config = supportedLanguages[language];

  if (!config) {
    return res.status(400).json({
      error: "Unsupported language. Use javascript or python."
    });
  }

  try {
    const pistonResponse = await axios.post(
      PISTON_URL,
      {
        language: config.piston,
        version: "*",
        files: [{ name: config.fileName, content: code }]
      },
      { timeout: 15000 }
    );

    const compile = pistonResponse.data.compile || {};
    const run = pistonResponse.data.run || {};

    const compileOutput = compile.output || "";
    const runOutput =
      run.output || [run.stdout, run.stderr].filter(Boolean).join("\n");

    const finalOutput =
      [compileOutput, runOutput].filter(Boolean).join("\n") || "No output";

    return res.json({ output: finalOutput });
  } catch (error) {
    if (language === "javascript") {
      try {
        const localOutput = runJavaScriptLocally(code) || "No output";

        return res.json({
          output:
            localOutput +
            "\n(offline mode: executed locally because online sandbox was unreachable)"
        });
      } catch (localError) {
        return res.json({ output: "Error: " + localError.message });
      }
    }

    return res.status(500).json({
      error: "Online code execution service unreachable: " + error.message
    });
  }
});

const distPath = path.join(__dirname, "dist");

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));

  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res.send("Local server running. Use http://localhost:5173 for development.");
  });
}

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log("Local server running on port " + PORT);
});