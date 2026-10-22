# @exploding-catan/bots

The AI, as pure functions over the engine's state.

```ts
const table = createTable([1, 2, 3], seed);   // seats 1–3 are bots
const action = nextBotAction(table, state, Date.now());   // or null: waiting on a person
```

`decide(bot, view, now)` returns the one action a bot wants: a setup
placement, a discard it owes, a trade reply, a Nope or Defuse, or the next
step of its own turn. The driver hands each bot `viewFor(state, seat)`, the
same redacted state a person at that seat would be sent, so a bot cannot
read another hand or the deck. Each bot carries its own seeded RNG, seeded
by seat, so a table of bots is a pure function of its seeds and adding a bot
mid-game does not reseed the others.

`test/` plays whole games across seeds, player counts, modes and boards and
checks every chosen action was legal, that the bank balances, that a seed
replays identically, and that the decision does not change when the deck is
permuted and other hands are swapped.
