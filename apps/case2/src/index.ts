import {
  expressConfig,
  temporalConfig,
} from "@bookipi/temporal-session-config";
import { NativeConnection, Worker } from "@temporalio/worker";
import { Connection, WorkflowClient } from "@temporalio/client";
import * as activities from "./activities";
import express from "express";
import { Server } from "node:http";
import * as wf1 from "./workflows/workflow1";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const app = express();
let httpServer: Server;

const taskQueue = "temporal-session-20250613-2";

const workers: Worker[] = [];
async function initWorkers() {
  const connection = await NativeConnection.connect({
    address: temporalConfig.address,
    tls: temporalConfig.useTLS,
  });
  const worker1 = await Worker.create({
    connection,
    activities,
    taskQueue: taskQueue,
    namespace: temporalConfig.namespace,
    enableNonLocalActivities: true,
    reuseV8Context: true,
    workflowsPath: require.resolve("./workflows/workflow1"),
    debugMode: true,
  });
  const worker2 = await Worker.create({
    connection,
    activities,
    taskQueue: taskQueue,
    namespace: temporalConfig.namespace,
    enableNonLocalActivities: true,
    reuseV8Context: true,
    workflowsPath: require.resolve("./workflows/workflow2"),
    debugMode: true,
  });
  workers.push(worker1, worker2);

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
  initWorkers().catch((err) => {
    console.error(err);
    process.exit(1);
  });
  app.get("/start", async (_req, res) => {
    const temporalClient = await getTemporalClient();
    try {
      await Promise.allSettled(workers.map((worker) => worker.shutdown()));
    } catch {}
    workers[0].run();
    await temporalClient.start(wf1.sumWorkflow, {
      taskQueue: taskQueue,
      workflowId: "sum-workflow",
      args: [[1, 2, 3, 4, 5]],
    });
    await sleep(10000);
    await workers[0].shutdown();
    workers[1].run();
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
