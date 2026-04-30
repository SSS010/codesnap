export type GradientOption = {
  id: "slate" | "violet" | "emerald" | "sunset";
  name: string;
  className: string;
};

export const GRADIENTS: GradientOption[] = [
  {
    id: "slate",
    name: "Slate Night",
    className: "bg-gradient-to-br from-slate-950 via-slate-900 to-black",
  },
  {
    id: "violet",
    name: "Violet Bloom",
    className: "bg-gradient-to-br from-slate-950 via-violet-950 to-fuchsia-950",
  },
  {
    id: "emerald",
    name: "Emerald Mist",
    className: "bg-gradient-to-br from-slate-950 via-emerald-950 to-cyan-950",
  },
  {
    id: "sunset",
    name: "Midnight Sunset",
    className: "bg-gradient-to-br from-slate-950 via-rose-950 to-amber-950",
  },
];

export function getGradientById(id: GradientOption["id"]): GradientOption {
  return GRADIENTS.find((g) => g.id === id) ?? GRADIENTS[0]!;
}

