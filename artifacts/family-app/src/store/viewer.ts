import { useSyncExternalStore } from "react";

const STORE_KEY = "familyspace_viewer";
type ViewerId = "alex" | "morgan" | "jamie";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("familyspace_viewer_change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("familyspace_viewer_change", callback);
  };
}

function getSnapshot() {
  const val = localStorage.getItem(STORE_KEY);
  if (val === "alex" || val === "morgan" || val === "jamie") return val;
  return "alex";
}

function getServerSnapshot() {
  return "alex";
}

export function useViewerStore() {
  const viewerId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) as ViewerId;
  const setViewerId = (id: ViewerId) => {
    localStorage.setItem(STORE_KEY, id);
    window.dispatchEvent(new Event("familyspace_viewer_change"));
  };
  return { viewerId, setViewerId };
}
