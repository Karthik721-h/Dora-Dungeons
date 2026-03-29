import { createRoot } from "react-dom/client";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// Register the JWT getter so every generated API client call automatically
// includes "Authorization: Bearer <token>" from localStorage.
setAuthTokenGetter(() => localStorage.getItem("dd_jwt"));

createRoot(document.getElementById("root")!).render(<App />);
