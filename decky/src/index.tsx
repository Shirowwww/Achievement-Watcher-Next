import { definePlugin, toaster } from "@decky/api";
import { staticClasses } from "@decky/ui";
import { FaTrophy } from "react-icons/fa";
import { FEED_URL, RETRY_MS, toToast } from "./feed";

/*
  In Game Mode gamescope draws a single external overlay, which MangoHud's performance overlay takes
  whenever it is shown, so AW's own popup can stay hidden. Steam's toasts are always drawn: this
  listens to AW's local feed and shows each notification as one.
*/
function listen() {
  let socket: WebSocket | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const connect = () => {
    socket = new WebSocket(FEED_URL);
    socket.onmessage = (event) => {
      const toast = toToast(String(event.data));
      if (!toast) return;
      toaster.toast({
        title: toast.title,
        body: toast.body,
        logo: toast.icon ? <img src={toast.icon} width={64} height={64} /> : undefined,
        playSound: toast.playSound,
      });
    };
    // AW may start after Steam, or restart: keep trying quietly.
    socket.onclose = () => {
      if (!stopped) retry = setTimeout(connect, RETRY_MS);
    };
  };

  connect();
  return () => {
    stopped = true;
    if (retry) clearTimeout(retry);
    socket?.close();
  };
}

export default definePlugin(() => {
  const stop = listen();
  return {
    name: "Achievement Watcher",
    titleView: <div className={staticClasses.Title}>Achievement Watcher</div>,
    content: <div>Achievement Watcher notifications are shown as Steam notifications.</div>,
    icon: <FaTrophy />,
    onDismount: stop,
  };
});
