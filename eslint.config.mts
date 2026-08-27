import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import tseslint from "typescript-eslint";

/**
 * ESLint runs only the Obsidian plugin-guideline checks. Everything general
 * purpose -- style, correctness, imports -- belongs to Biome, so the two never
 * report the same problem twice.
 */

const OBSIDIAN_RULE_PREFIX = "obsidianmd/";

/**
 * Takes the obsidianmd rules, at the severities the plugin recommends, out of
 * its bundled config. Extracting rather than listing them means rules added by
 * a future plugin release arrive on upgrade instead of being silently missed.
 */
const obsidianRules = Object.fromEntries(
	obsidianmd.configs.recommended
		.flatMap((config) => Object.entries(config.rules ?? {}))
		.filter(([rule]) => rule.startsWith(OBSIDIAN_RULE_PREFIX)),
);

export default defineConfig(globalIgnores(["node_modules", "main.js", "**/*.test.ts"]), {
	files: ["src/**/*.ts"],
	plugins: { obsidianmd },
	languageOptions: {
		parser: tseslint.parser,
		parserOptions: {
			projectService: true,
			tsconfigRootDir: import.meta.dirname,
		},
	},
	rules: obsidianRules,
});
