/**
 * This is a simplified implementation of a workflow engine that supports:
 * - Activity execution with history tracking
 * - Workflow sleep/timer functionality
 * - Workflow resumption
 * - Caching of activity results for deterministic replay
 */

/**
 * @typedef {Object} ActivityHistory
 * @property {string} id - Workflow ID
 * @property {string} name - Name of the activity
 * @property {'success' | 'error' | 'running'} status - Current status of the activity
 * @property {Object} input - Input parameters passed to the activity
 * @property {Object} output - Output/result of the activity
 */

/**
 * Stores the execution history of all activities for each workflow
 * @type {Object.<string, [ActivityHistory]>}
 */
const historyStore = {};

/**
 * @typedef {Object} WorkflowContext
 * @property {number} seq - Sequence number for deterministic activity execution
 */

/**
 * Stores workflow context for each workflow instance
 * @type {Object.<string, WorkflowContext>}
 */
const context = {};

/**
 * @typedef {Function} Activity
 * @param {Object} input - Input parameters for the activity
 * @returns {Object} - Result of the activity execution
 */

/**
 * Creates an activity function that tracks execution history and supports caching
 * @param {string} wid - Workflow ID
 * @param {Function} func - The actual activity function to execute
 * @returns {Activity} - Wrapped activity function with history tracking
 */
function ActivityFromFunction(wid, func) {
	return async function (input) {
		console.log("ActivityFromFunction", wid, func.name, input);
		const ctx = context[wid];
		historyStore[wid] = historyStore[wid] || [];
		const lastReturn = getCachedResult(wid, ctx, func);
		ctx.seq += 1;
		if (lastReturn !== undefined) {
			console.log("ActivityFromFunction", wid, func.name, "cached", lastReturn);
			return lastReturn;
		}

		/** @type {ActivityHistory} */
		const historyEntry = {
			id: wid,
			name: func.name,
			status: "running",
			input,
		};
		historyStore[wid].push(historyEntry);

		// execute the function
		const ret = await func(input);

		historyEntry.status = "completed";
		historyEntry.output = ret;
		return ret;
	};
}

/**
 * Retrieves cached result for an activity if it has been executed before
 * @param {string} wid - Workflow ID
 * @param {WorkflowContext} ctx - Workflow context
 * @param {Function} func - Activity function
 * @returns {Object|undefined} - Cached result if available
 */
function getCachedResult(wid, ctx, func) {
	const hs = historyStore[wid];
	if (ctx.seq < hs.length && hs[ctx.seq].status === "completed") {
		if (hs[ctx.seq].name !== func.name) {
			throw new Error(
				"Activity name mismatch: " +
					hs[ctx.seq].name +
					" !== " +
					func.name +
					"",
			);
		}
		// if the activity has already been executed, return the result
		return hs[ctx.seq].output;
	}
	return;
}

/**
 * Creates a sleep activity that can be resumed later
 * @param {string} wid - Workflow ID
 * @returns {Function} - Sleep activity function
 */
function workflowSleep(wid) {
	return async function timer(ms) {
		const ctx = context[wid];
		historyStore[wid] = historyStore[wid] || [];
		const lastReturn = getCachedResult(wid, ctx, { name: "sleep" });
		ctx.seq += 1;
		if (lastReturn !== undefined) {
			console.log("ActivityFromFunction", wid, "sleep", "cached", lastReturn);
			return lastReturn;
		}

		historyStore[wid] = historyStore[wid] || [];
		const now = new Date();
		const historyEntry = {
			id: wid,
			name: "sleep",
			status: "running",
			input: {
				now,
				wakeUpAt: new Date(now.getTime() + ms),
			},
		};
		historyStore[wid].push(historyEntry);
		ScheduleWakeUp(wid, now.getTime() + ms);
		// await new Promise((resolve) => setTimeout(resolve, ms));
		historyEntry.status = "completed";
		historyEntry.output = null;
		throw new SleepError("SLEEP");
	};
}

/**
 * Custom error class to handle workflow sleep interruption
 */
class SleepError extends Error {
	constructor(message) {
		super(message);
	}
}

/**
 * Utility function for actual sleep implementation
 * @param {number} ms - Milliseconds to sleep
 */
async function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Example activity that simulates sending a Slack message
 * @param {Object} input - Message input
 * @returns {Object} - Success status
 */
async function SendSlackMessage(input) {
	console.log("sending slack message...", input);
	await sleep(1000);
	console.log("done: sending slack message");
	return {
		success: true,
	};
}

/**
 * Handles errors during workflow execution
 * @param {Error} err - Error that occurred
 */
function errorHandler(err) {
	if (err instanceof SleepError) {
		// save the history and exit
		console.log("Sleep, saving history and exiting");
		saveHistoryToFile("history.json");
		process.exit(0);
	} else {
		console.log(err);
	}
}

/**
 * Starts a new workflow instance
 * Creates workflow context and initializes activities
 */
function StartWorkflow() {
	const workflowId = "workflowId";
	console.log("starting workflow", workflowId);
	context[workflowId] = { seq: 0 };
	historyStore[workflowId] = [];
	const activities = {
		SendSlackMessage: ActivityFromFunction(workflowId, SendSlackMessage),
		sleep: workflowSleep(workflowId),
	};
	NotifyWorkflow(workflowId, activities).catch(errorHandler);
}

/**
 * Resumes a workflow from where it left off
 * @param {string} workflowId - ID of the workflow to resume
 */
function ResumeWorkflow(workflowId) {
	console.log("resuming workflow", workflowId);
	context[workflowId] = { seq: 0 };
	const activities = {
		SendSlackMessage: ActivityFromFunction(workflowId, SendSlackMessage),
		sleep: workflowSleep(workflowId),
	};
	// FIXME: handle timer check and schedule a wakeup if needed
	NotifyWorkflow(workflowId, activities).catch(errorHandler);
}

/**
 * Schedules a workflow to be resumed at a specific timestamp
 * @param {string} workflowId - Workflow ID to resume
 * @param {number} timestamp - When to resume the workflow
 */
function ScheduleWakeUp(workflowId, timestamp) {
	const now = Date.now();
	setTimeout(() => {
		console.log("timer fired", now);
		// historyStore[workflowId].push({
		// 	eventType: "TimerFired",
		// 	timestamp,
		// });
		ResumeWorkflow(workflowId);
	}, timestamp - now);
}

/**
 * Example workflow that sends messages with delays
 * @param {string} _workflowId - Workflow ID
 * @param {Object} activities - Available activities
 */
async function NotifyWorkflow(_workflowId, activities) {
	let i = 0;
	while (i < 3) {
		console.log(`i = ${i}`);
		await activities.SendSlackMessage("message " + i);
		await activities.sleep(3000);
		i++;
	}
}

const fs = require("fs");

/**
 * Saves the historyStore to a file as JSON
 * @param {string} filename - The file to save to
 */
function saveHistoryToFile(filename) {
	fs.writeFileSync(filename, JSON.stringify(historyStore, null, 2), "utf-8");
}

/**
 * Loads the historyStore from a file if it exists
 * @param {string} filename - The file to load from
 */
function loadHistoryFromFile(filename) {
	if (fs.existsSync(filename)) {
		const data = fs.readFileSync(filename, "utf-8");
		try {
			const parsed = JSON.parse(data);
			Object.keys(parsed).forEach((key) => {
				historyStore[key] = parsed[key];
			});
		} catch (e) {
			console.error("Failed to parse history file:", e);
		}
	}
}

// Load history at startup
loadHistoryFromFile("history.json");

if (historyStore["workflowId"]) {
	ResumeWorkflow("workflowId");
} else {
	StartWorkflow();
}
// setInterval(() => console.log(historyStore["workflowId"]), 1000);
