/** Métadonnées canvas pour les nœuds personnalisés (présentation palette : config/nodeRegistry). */

export const DIRECT_AGENT_PROCESSOR_TYPE = "direct_agent_processor";

export const DIRECT_AGENT_NODE_DEF = {
	nodeType: DIRECT_AGENT_PROCESSOR_TYPE,
	label: "AI Direct Processor",
	category: "Intelligence Artificielle",
	inputHandles: ["input"],
	outputHandles: ["output"],
} as const;

export const AUTO_ARCHITECT_AGENT_TYPE = "auto_architect_agent";

/** Déclaration palette — section AGENTS / Advanced AI */
export const AUTO_ARCHITECT_AGENT_NODE_DEF = {
	type: AUTO_ARCHITECT_AGENT_TYPE,
	nodeType: AUTO_ARCHITECT_AGENT_TYPE,
	label: "Auto-Architect Agent",
	category: "AGENTS",
	description:
		"Agent autonome multi-étapes : planifie et génère l'intégralité du pipeline nœud par nœud.",
	icon: "Bot",
	inputHandles: ["input"],
	outputHandles: ["output"],
	defaultParams: {
		global_objective: "",
		auto_advance: true,
	},
} as const;
