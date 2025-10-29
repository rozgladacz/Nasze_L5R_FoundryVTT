# Roll n Keep (RnK)
The RnK use `ChatMessage` to retrieve the roll, alter it, add the new message and delete the old.

> If you have any idea how to modify directly the ChatMessage and update it, let me know.

Usage :
```js
new RollnKeepDialog(messageId).render(true);
```

It is also possible to provide initial action type tags that should be associated with the roll. Supply them through the `initialActionTags` option as an object, a string, or an array of strings representing action keys (for example `"attack"`, `"scheme"`, `"support"`, or `"move"`). A legacy third constructor argument is still accepted for backward compatibility, but new code should prefer the options property.

```js
new RollnKeepDialog(messageId, { initialActionTags: { attack: true, scheme: true } }).render(true);
// Equivalent shorthand forms:
// new RollnKeepDialog(messageId, { initialActionTags: ["attack", "scheme"] }).render(true);
// new RollnKeepDialog(messageId, { initialActionTags: "attack" }).render(true);
```
