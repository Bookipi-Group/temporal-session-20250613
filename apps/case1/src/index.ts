import {
  expressConfig,
  temporalConfig,
} from "@bookipi/temporal-session-config";
import { NativeConnection, Worker } from "@temporalio/worker";
import { Connection, WorkflowClient } from "@temporalio/client";
import * as activities from "./activities";
import express from "express";
import { Server } from "node:http";
import { newUserWorkflow, eventSignal } from "./workflows";

const app = express();
let httpServer: Server;

async function runWorkers() {
  const connection = await NativeConnection.connect({
    address: temporalConfig.address,
    tls: temporalConfig.useTLS,
  });
  const worker = await Worker.create({
    connection,
    activities,
    taskQueue: "temporal-session-20250613",
    maxCachedWorkflows: 10,
    namespace: temporalConfig.namespace,
    enableNonLocalActivities: true,
    reuseV8Context: true,
    workflowsPath: require.resolve("./workflows"),
    debugMode: true,
  });
  const workers = [worker];

  const shutdownWorker = async () => {
    await Promise.all(
      workers.map(async (worker) => {
        worker.shutdown();
        try {
          while (worker.getState() !== "STOPPED") {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        } catch {}
      }),
    );
    await connection.close();
    await httpServer.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    console.log("SIGINT signal received: closing worker server");
    shutdownWorker();
  });
  process.on("SIGTERM", () => {
    console.log("SIGTERM signal received: closing worker server");
    shutdownWorker();
  });

  const workerPromises = workers.map((worker) => worker.run());
  await Promise.all(workerPromises);
}

let temporalClient: WorkflowClient;
async function getTemporalClient() {
  if (temporalClient) {
    return temporalClient;
  }
  const connectionOptions = {
    address: temporalConfig.address,
    tls: temporalConfig.useTLS,
  };
  const connection = await Connection.connect(connectionOptions);
  temporalClient = new WorkflowClient({
    connection,
    namespace: temporalConfig.namespace,
  });
  return temporalClient;
}

async function run() {
  runWorkers().catch((err) => {
    console.error(err);
    process.exit(1);
  });
  app.get("/start", async (_req, res) => {
    const { email } = _req.query;
    const temporalClient = await getTemporalClient();
    temporalClient.start(newUserWorkflow, {
      taskQueue: "temporal-session-20250613",
      workflowId: `new-user-workflow-${email}`,
      args: [email],
    });
    return res.status(200).end("success");
  });
  app.get("/event", async (_req, res) => {
    const { email, event } = _req.query;
    const handle = await getTemporalClient();
    const workflowId = `new-user-workflow-${email}`;
    const workflowHandle = await handle.getHandle(workflowId);
    await workflowHandle.signal(eventSignal, {
      name: event,
      payload: event,
    });
    return res.status(200).end("success");
  });
  app.use((_req, res) => {
    res.status(200).end();
  });
  httpServer = app.listen(expressConfig.port, () => {
    console.log("worker is running", expressConfig.port);
  });
}
run();
