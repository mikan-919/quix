import { component } from ".";
import { generateQuixOutput } from "./generator";
import { h } from "./h";
import { logger } from "./logger";

const App = component("App")
  .state("count", 0)
  .derived("double", (s) => s.count() * 2)
  .handler("click", (state)=>state.count(state.count()+1))
  .render(({ state,handlers }) => (
    h("div", null,
      h("h1", null, "Counter"),
      h("button", { onClick:handlers.click }, "Increment x2"),
      h("p", null,'Value: ',state.double()) // コンパイラが関数化した想定
    )
  ));

logger.log(generateQuixOutput(App))
