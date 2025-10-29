# Roll n Keep (RnK)
The RnK use `ChatMessage` to retrieve the roll, alter it, add the new message and delete the old.

> If you have any idea how to modify directly the ChatMessage and update it, let me know.

Usage :
```js
new RollnKeepDialog(messageId).render(true);
```

It is also possible to provide initial action type tags that should be associated with the roll. The third parameter accepts either an object, a string, or an array of strings representing action keys (for example `"attack"`, `"scheme"`, `"support"`, or `"move"`).

```js
new RollnKeepDialog(messageId, {}, { attack: true, scheme: true }).render(true);
// Equivalent shorthand forms:
// new RollnKeepDialog(messageId, {}, ["attack", "scheme"]).render(true);
// new RollnKeepDialog(messageId, {}, "attack").render(true);
```
