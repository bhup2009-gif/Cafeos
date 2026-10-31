export const themeIds = ["garden", "cyber-blue", "neon-lime"] as const;
export type ThemeId = (typeof themeIds)[number];
export const themes: {
  id: ThemeId;
  name: string;
  mood: string;
  description: string;
  colors: string[];
  background: string;
  surface: string;
  ink: string;
  accent: string;
  onAccent: string;
}[] = [
  {
    id: "garden",
    name: "Café Garden",
    mood: "Calm & familiar",
    description: "A soft, grounded rhythm for the everyday shift.",
    colors: ["#375C43", "#A7BC94", "#D8B78A", "#FAF9F6", "#252925"],
    background: "#FAF9F6",
    surface: "#FFFFFF",
    ink: "#252925",
    accent: "#375C43",
    onAccent: "#FFFFFF",
  },
  {
    id: "cyber-blue",
    name: "Cyber Blue",
    mood: "Focused & confident",
    description: "A crisp blue workspace for a team in its flow.",
    colors: ["#2864F0", "#00BEA2", "#FFC857", "#F5F8FF", "#18243E"],
    background: "#F5F8FF",
    surface: "#FFFFFF",
    ink: "#18243E",
    accent: "#2864F0",
    onAccent: "#FFFFFF",
  },
  {
    id: "neon-lime",
    name: "Neon Lime",
    mood: "Fresh & energetic",
    description: "Deep green surfaces and a bright spark of lime.",
    colors: ["#BEF64B", "#6ACCA3", "#FFC857", "#17231D", "#F4F8EF"],
    background: "#17231D",
    surface: "#293A30",
    ink: "#F4F8EF",
    accent: "#BEF64B",
    onAccent: "#17231D",
  },
];
