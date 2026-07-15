import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyTheme } from "@/utils/theme";
import App from "./App.jsx";
import "@/theme.css";
import "./App.css";

await applyTheme();

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
