import { livrerPush } from "../src/server/notifications";
// Travailleur durable optionnel : les tentatives sont conservées dans MySQL.
await livrerPush();
setInterval(() => void livrerPush(), 30000);
