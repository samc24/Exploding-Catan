/* The rules, as JP wrote them: what changed from Catan, the deck, how a card is
   played, what a Nope and a Defuse reach, the forced Nope, and the one card
   immune to all of it. Readable before any game starts. */
import { KITTEN, type CardKey } from "@exploding-catan/engine";
import { h } from "./dom";
import { closeModal, openModal } from "./dialogs";

export function showRules(): void {
  const body = h("div", { class: "rules" },
    h("p", null, "Catan, with the development deck replaced by 54 kitten cards. Build roads, settlements and cities; first to the target wins — unless somebody still holds a Nope."),
    h("h4", null, "Changed rules"),
    h("ul", null,
      h("li", null, "A kitten card costs ", h("b", null, "any 3 different resources"), " (not wheat + sheep + ore)."),
      h("li", null, "You may play ", h("b", null, "as many kitten cards per turn as you like"), ", starting the turn after you buy them. A Nope, an Attack and an Exploding Kitten can be thrown on anybody's turn."),
      h("li", null, "Knights still count toward Largest Army — there are 10 of them."),
    ),
    h("h4", null, "The deck (54)"),
    h("ul", null, (Object.keys(KITTEN) as CardKey[]).filter((k) => k !== "hidden").map((k) => h("li", null, h("b", null, `${KITTEN[k].name} ×${KITTEN[k].count}`), ` — ${KITTEN[k].text}`))),
    h("h4", null, "Playing a card"),
    h("p", null, "Every kitten card is played by ", h("b", null, "dragging it"), " out of your hand and dropping it on the discard pile (a click does the same). A card that needs aiming asks who, or which two number tokens, afterwards."),
    h("h4", null, "Nope & Defuse"),
    h("p", null, "Both are reactions, played out of turn, and the card is always spent. ", h("b", null, "Anything can be Noped"), ", including another Nope and including a Defuse — as many times over as people are willing to spend cards, with the last one standing settling it. Noping a Defuse cancels the \"no you\": the original card is simply played again, at whoever it was first aimed at. A ", h("b", null, "Defuse"), " cannot answer another Defuse, though — \"no you\" does not stack against itself."),
    h("p", null, h("b", null, "Everything is answered on the discard pile."), " Drop a Nope or a Defuse there and it answers whatever there is to answer — a card aimed at you, a roll, a seven's discard, the robber landing on you. When it could answer more than one thing, it asks which. A Nope can also cancel the whole turn in progress: everything that turn gained is destroyed, everything it took is handed back, and nothing it spent comes back."),
    h("p", null, h("b", null, "Last call is the end of the turn"), ", and only the last four things that happened can be answered — once a turn is over and three seconds have passed, everything in it is settled. Bots take three seconds between moves, so there is always time."),
    h("p", null, h("b", null, "Defuse"), " answers an attack aimed at you by turning it around onto whoever played it. Alter the Future and Favor hand you the card's power rather than simply reflecting it — you name the two tokens, or your own three resources. A Defuse also buys your hand out of a seven's cut, and sends the robber back where it came from (and you move it instead)."),
    h("p", null, h("b", null, "Forced Nope."), " The moment somebody wins, the next player in turn order who holds a Nope ", h("i", null, "must"), " spend it — no choice. Otherwise everyone would sit on their Nopes waiting for somebody else to spend theirs first. A cancelled win costs the winner every Feral Kitten in their hand."),
    h("p", null, "The ", h("b", null, "Imploding Kitten"), " is immune to all of it. It cannot be Noped or Defused, and the turn it lands in cannot be touched — it simply ends after twenty seconds."),
  );
  openModal("Exploding Catan — Rules", body, [{ label: "Close", cls: "primary", fn: closeModal }]);
}
