import "dotenv/config";
import { getMongoStatus, closeMongoConnection } from "../server/mongo.js";

const status = await getMongoStatus();
console.log(JSON.stringify(status, null, 2));
await closeMongoConnection();

if (!status.connected) {
  process.exitCode = 1;
}
