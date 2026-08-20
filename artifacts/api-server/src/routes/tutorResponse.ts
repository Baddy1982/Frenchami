export const normalizeTutorResponse = (value: unknown): unknown => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;

  const response = value as Record<string, unknown>;
  if (typeof response.mistakes !== "string") return response;

  const mistake = response.mistakes.trim();
  return { ...response, mistakes: mistake ? [mistake] : [] };
};