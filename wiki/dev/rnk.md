# Roll n Keep (RnK)
The RnK use `ChatMessage` to retrieve the roll, alter it, add the new message and delete the old.

> If you have any idea how to modify directly the ChatMessage and update it, let me know.

Usage :
```js
new RollnKeepDialog(messageId).render(true);
```

## Manual regression scenario

To confirm effect macros become active again after undoing and re-opening the summary:

1. Trigger a roll that generates at least one effect entry with an execution macro.
2. Enter the summary, execute or mark the entry so it becomes active.
3. Use **Undo the last step choices** to roll back to the previous step.
4. Re-open the summary and verify the entry returned to the queue in the active state and executes again when finalized.
