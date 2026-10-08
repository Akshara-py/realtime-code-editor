import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";

import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine
} from "@codemirror/view";

import {
  defaultKeymap,
  history,
  historyKeymap
} from "@codemirror/commands";

import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";

import { yCollab } from "y-codemirror.next";

const isDev =
  window.location.hostname === "localhost" && window.location.port === "5173";

const RUN_URL = isDev ? "http://localhost:3001/run" : "/api/run";

const params = new URLSearchParams(window.location.search);
const room = params.get("room") || "demo";

document.getElementById("room").textContent = `Room: ${room}`;

const ydoc = new Y.Doc();

// Peer-to-peer collaboration: browsers sync directly with each other
const provider = new WebrtcProvider(room, ydoc);

const ytext = ydoc.getText("codemirror");
const youtput = ydoc.getText("output");
const meta = ydoc.getMap("meta");

const DEFAULT_CODE = `// Real-Time Collaborative Code Editor
// Uses Yjs CRDT for conflict-free merging.

console.log("Hello from shared room");
`;

function initializeDefaultCode() {
  ydoc.transact(() => {
    if (!meta.get("initialized")) {
      meta.set("initialized", true);

      if (ytext.length === 0) {
        ytext.insert(0, DEFAULT_CODE);
      }
    }
  });
}

setTimeout(initializeDefaultCode, 3000);

const languageCompartment = new Compartment();

const view = new EditorView({
  parent: document.getElementById("editor"),
  state: EditorState.create({
    doc: ytext.toString(),
    extensions: [
      lineNumbers(),
      highlightActiveLine(),
      history(),
      oneDark,
      keymap.of([...defaultKeymap, ...historyKeymap]),
      languageCompartment.of(javascript()),
      yCollab(ytext, provider.awareness)
    ]
  })
});

provider.awareness.on("change", () => {
  const count = provider.awareness.getStates().size;
  document.getElementById("users").textContent = `${count} online`;
});

const outputElement = document.getElementById("output");

function renderOutput() {
  outputElement.textContent =
    youtput.toString() || "Output will appear here...";
}

youtput.observe(renderOutput);
renderOutput();

function setSharedOutput(text) {
  ydoc.transact(() => {
    youtput.delete(0, youtput.length);
    youtput.insert(0, text);
  });
}

const languageSelect = document.getElementById("language");

languageSelect.addEventListener("change", () => {
  const extension =
    languageSelect.value === "python" ? python() : javascript();

  view.dispatch({
    effects: languageCompartment.reconfigure(extension)
  });
});

const runButton = document.getElementById("run");

runButton.addEventListener("click", async () => {
  runButton.disabled = true;
  setSharedOutput("Running...");

  try {
    const response = await fetch(RUN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        language: languageSelect.value,
        code: view.state.doc.toString()
      })
    });

    const data = await response.json();

    if (!response.ok) {
      setSharedOutput(data.error || "Execution failed");
    } else {
      setSharedOutput(data.output || "No output");
    }
  } catch (error) {
    setSharedOutput(`Request error: ${error.message}`);
  } finally {
    runButton.disabled = false;
  }
});
