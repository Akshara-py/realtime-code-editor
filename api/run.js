import vm from "vm";

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const { language = "javascript", code = "" } = req.body || {};

  const config = supportedLanguages[language];

  if (!config) {
    return res.status(400).json({
      error: "Unsupported language. Use javascript or python."
    });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const pistonResponse = await fetch(PISTON_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        language: config.piston,
        version: "*",
        files: [{ name: config.fileName, content: code }]
      }),
      signal: controller.signal
    });

    clearTimeout(timer);

    const data = await pistonResponse.json();

    const compile = data.compile || {};
    const run = data.run || {};

    const compileOutput = compile.output || "";
    const runOutput =
      run.output || [run.stdout, run.stderr].filter(Boolean).join("\n");

    const finalOutput =
      [compileOutput, runOutput].filter(Boolean).join("\n") || "No output";

    return res.status(200).json({ output: finalOutput });
  } catch (error) {
    if (language === "javascript") {
      try {
        const localOutput = runJavaScriptLocally(code) || "No output";

        return res.status(200).json({
          output:
            localOutput +
            "\n(offline mode: executed locally because online sandbox was unreachable)"
        });
      } catch (localError) {
        return res.status(200).json({ output: "Error: " + localError.message });
      }
    }

    return res.status(500).json({
      error: "Online code execution service unreachable: " + error.message
    });
  }
}
