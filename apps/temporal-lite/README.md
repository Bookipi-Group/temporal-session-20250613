# Example Workflow Engine
This is an example implementation of workflow engine that can execute activities, sleep, and resume after sleep.

## To run
1. Run `node index.js`

A history file will be created in the root directory. This file will be used to resume the workflow if it is interrupted.

## Resuming
Same as running the workflow:
1. Run `node index.js`

## Cleanup
remove `history.json` to reset progress
