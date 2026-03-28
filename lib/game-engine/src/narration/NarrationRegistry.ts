type TemplateVars = Record<string, string | number>;

const registry = new Map<string, string[]>();

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function interpolate(template: string, vars: TemplateVars): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}

export const NarrationRegistry = {
  register(key: string, templates: string[]): void {
    registry.set(key, templates);
  },

  get(key: string, vars: TemplateVars = {}): string {
    const templates = registry.get(key);
    if (!templates || templates.length === 0) return `[no narration for: ${key}]`;
    return interpolate(pick(templates), vars);
  },

  has(key: string): boolean {
    return registry.has(key);
  },
};
