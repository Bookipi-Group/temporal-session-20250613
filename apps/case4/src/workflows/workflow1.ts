import { proxyActivities, sleep } from "@temporalio/workflow";
import type * as activities from "../activities";
const { sum } = proxyActivities<{
  [funcName in keyof typeof activities]: (typeof activities)[funcName];
}>({
  startToCloseTimeout: "1m",
  retry: {
    backoffCoefficient: 2,
    initialInterval: 60000, // 1 minute
    maximumAttempts: 2,
  },
});

export const sumWorkflow = async (numbers: number[]): Promise<number> => {
  const mod = Date.now() % 1000;
  const total = await sum(numbers);
  await sleep(20000 + mod);
  return total;
};
