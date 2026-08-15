import type { WafRule } from "./types";
import defaultRules from "./rules.json";

// In-memory compiled rules cache
export interface CompiledWafRule extends WafRule {
  compiledRegex?: RegExp;
}

let compiledRules: CompiledWafRule[] = [];

/**
 * Loads rules from config and compiles regex expressions once at startup.
 */
export function loadRules() {
  compiledRules = (defaultRules as WafRule[]).map((rule) => {
    if (rule.operator === "regex") {
      try {
        // Compile case-insensitive regex
        return {
          ...rule,
          compiledRegex: new RegExp(rule.pattern, "i"),
        };
      } catch (err: any) {
        console.error(`[KCT SHIELD] Failed to compile regex for rule ${rule.id}:`, err.message);
        return rule;
      }
    }
    return rule;
  });
  console.log(`[KCT SHIELD] Loaded ${compiledRules.length} compiled rules.`);
}

/**
 * Returns current rules in memory.
 */
export function getRules(): CompiledWafRule[] {
  return compiledRules;
}

/**
 * Dynamically updates rules in-memory.
 */
export function updateRules(newRules: WafRule[]) {
  compiledRules = newRules.map((rule) => {
    if (rule.operator === "regex") {
      try {
        return {
          ...rule,
          compiledRegex: new RegExp(rule.pattern, "i"),
        };
      } catch (err) {
        return rule;
      }
    }
    return rule;
  });
}
