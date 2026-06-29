/*
  Maps each avatar slug (the allocation pool in src/core/people.ts) to its
  vendored Twemoji SVG asset URL. See ATTRIBUTION.md (CC-BY 4.0).
*/
import type { AvatarId } from "../../core/index.ts";

import redApple from "./red-apple.svg";
import greenApple from "./green-apple.svg";
import pear from "./pear.svg";
import tangerine from "./tangerine.svg";
import lemon from "./lemon.svg";
import banana from "./banana.svg";
import watermelon from "./watermelon.svg";
import grapes from "./grapes.svg";
import strawberry from "./strawberry.svg";
import blueberries from "./blueberries.svg";
import cherries from "./cherries.svg";
import peach from "./peach.svg";
import mango from "./mango.svg";
import pineapple from "./pineapple.svg";
import coconut from "./coconut.svg";
import kiwi from "./kiwi.svg";
import melon from "./melon.svg";
import tomato from "./tomato.svg";
import avocado from "./avocado.svg";
import olive from "./olive.svg";
import bellPepper from "./bell-pepper.svg";
import hotPepper from "./hot-pepper.svg";
import cucumber from "./cucumber.svg";
import corn from "./corn.svg";

export const AVATAR_SVGS: Record<AvatarId, string> = {
  "red-apple": redApple,
  "green-apple": greenApple,
  pear,
  tangerine,
  lemon,
  banana,
  watermelon,
  grapes,
  strawberry,
  blueberries,
  cherries,
  peach,
  mango,
  pineapple,
  coconut,
  kiwi,
  melon,
  tomato,
  avocado,
  olive,
  "bell-pepper": bellPepper,
  "hot-pepper": hotPepper,
  cucumber,
  corn,
};
