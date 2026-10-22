import { KITTEN, type CardKey } from "@exploding-catan/engine";
import { h } from "./dom";
import { closeModal, openModal } from "./dialogs";

export function showRules(): void {
  const body = h("div", { class: "rules" },
    h("p", null, "Catan, with the development deck replaced by 54 kitten cards. Build roads, settlements and cities; first to the target wins — unless somebody still holds a Nope."),
    h("h4", null, "What is different from Catan"),
    h("p", null, "A kitten card costs any 3 different resources. You may play as many as you like on your turn, starting the turn after you buy them. A Nope, an Attack and an Exploding Kitten can be thrown on anybody's turn."),
    h("p", null, "Every action is written to the log and can be answered for a few lines afterwards: a Nope cancels a card (or a whole turn), a Defuse reflects an attack back at whoever played it. A cancelled turn loses everything it gained; nothing it spent comes back."),
    h("p", null, "When somebody reaches the target, the next player in turn order holding a Nope must spend it. The win lands when nobody can deny it any more."),
    h("h4", null, "The cards"),
    (Object.keys(KITTEN) as CardKey[]).map((k) => h("p", null, h("b", { style: { color: "var(--ink)" } }, `${KITTEN[k].name} ×${KITTEN[k].count}: `), KITTEN[k].text)),
  );
  openModal("Rules", body, [{ label: "Close", fn: closeModal }]);
}
