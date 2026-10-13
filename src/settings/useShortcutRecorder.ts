import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { listen } from "@tauri-apps/api/event";
import { command, errorText, isTauri } from "../native";
import { shortcutFromEvent, type ShortcutKey } from "./model";

export function useShortcutRecorder(save: (key: ShortcutKey, value: string) => void, fail: (key: ShortcutKey, message: string) => void) {
  const [recording, setRecording] = useState<ShortcutKey | null>(null);
  const [ready, setReady] = useState(false);
  const active = useRef<ShortcutKey | null>(null);
  const readyRef = useRef(false);
  const callbacks = useRef({ save, fail });
  callbacks.current = { save, fail };
  const stop = () => {
    const key = active.current;
    active.current = null; readyRef.current = false;
    setRecording(null); setReady(false);
    if (key && isTauri()) void command("set_shortcut_recording", { recording: false }).catch(error => callbacks.current.fail(key, errorText(error)));
  };
  const receive = (shortcut: string, native = false) => {
    const key = active.current;
    if (!key || !native && !readyRef.current) return;
    stop();
    if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
    callbacks.current.save(key, shortcut);
  };
  const receiveRef = useRef(receive);
  receiveRef.current = receive;
  useEffect(() => {
    const blur = () => { stop(); };
    window.addEventListener("blur", blur);
    const listener = isTauri() ? listen<string>("shortcut-recorded", event => receiveRef.current(event.payload, true)) : null;
    void listener?.catch(error => { if (active.current) callbacks.current.fail(active.current, errorText(error)); });
    return () => {
      window.removeEventListener("blur", blur);
      if (isTauri()) void command("set_shortcut_recording", { recording: false }).catch(() => {});
      void listener?.then(unlisten => unlisten()).catch(() => {});
    };
  }, []);
  const start = async (key: ShortcutKey) => {
    if (active.current === key) return;
    active.current = key; readyRef.current = false;
    setRecording(key); setReady(false);
    try {
      if (isTauri()) await command("set_shortcut_recording", { recording: true });
      if (active.current === key) { readyRef.current = true; setReady(true); }
    } catch (error) {
      if (active.current === key) { stop(); callbacks.current.fail(key, errorText(error)); }
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!active.current) return;
    event.stopPropagation();
    if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") event.preventDefault();
      stop();
      if (event.key === "Escape") event.currentTarget.blur();
      return;
    }
    event.preventDefault();
    const shortcut = shortcutFromEvent(event.nativeEvent);
    if (shortcut) receive(shortcut);
  };
  return { recording, ready, start, stop, onKeyDown };
}
