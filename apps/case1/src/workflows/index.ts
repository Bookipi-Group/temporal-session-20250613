import {
  condition,
  defineSignal,
  proxyActivities,
  setHandler,
  sleep,
} from "@temporalio/workflow";
import type * as activities from "../activities";
const { sendReminderEmail } = proxyActivities<{
  [funcName in keyof typeof activities]: (typeof activities)[funcName];
}>({
  startToCloseTimeout: "1m",
  retry: {
    backoffCoefficient: 2,
    initialInterval: 60000, // 1 minute
    maximumAttempts: 2,
  },
});

type EventSignal = {
  name: string;
  payload: string;
};

export const eventSignal = defineSignal<[EventSignal]>("eventSignal");

export type IStore = { [key: string]: string };

const notificationDays = [1, 7, 14, 28];

export const newUserWorkflow = async (email: string): Promise<void> => {
  let store: IStore = {};
  const start = Date.now();

  setHandler(eventSignal, async (event) => {
    console.log("Received event signal:", event);
    store[event.name] = event.payload;
  });

  for (let i = 0; i < notificationDays.length; i++) {
    await condition(
      () => !!store["invoice.send"],
      notificationDays[i] * 24 * 60 * 60 * 1000 + start - Date.now(),
    );
    if (store["invoice.send"]) {
      return;
    } else {
      await sendReminderEmail(email, "Reminder: Please send your invoice");
    }
  }
  // user has not sent an invoice after all reminders
};
