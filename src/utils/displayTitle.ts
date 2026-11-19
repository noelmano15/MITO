export interface FormattedCinemaTitle {
  primaryTitle: string;
  subtitle: string | null;
}

/**
 * Splits raw festival/filename metadata from the primary monumental film title
 * so cinema heroes and detail headers render with clean editorial hierarchy.
 */
export function formatCinemaTitle(rawTitle: string): FormattedCinemaTitle {
  const clean = (rawTitle || '').trim();
  if (!clean) {
    return { primaryTitle: 'MITO', subtitle: null };
  }

  // Known festival nominee title format for BESA
  const besaMatch = clean.match(/^(BESA)\s+(?:Short Film\s+)?(.+)$/i);
  if (besaMatch && clean.length > 28) {
    const cleanedSub = besaMatch[2]
      .replace(/\(\d+p\)/gi, '')
      .replace(/(?:\s*-\s*|\s+)OLL KORRECT/gi, ' · OLL KORRECT')
      .trim();
    return {
      primaryTitle: besaMatch[1].toUpperCase(),
      subtitle: cleanedSub || 'Film i Shkurtër Kinematografik',
    };
  }

  // Generic split on hyphen/em-dash if title is very long
  const dashIdx = clean.indexOf(' - ');
  if (clean.length > 36 && dashIdx > 3) {
    return {
      primaryTitle: clean.slice(0, dashIdx).trim(),
      subtitle: clean.slice(dashIdx + 3).replace(/\(\d+p\)/gi, '').trim(),
    };
  }

  return { primaryTitle: clean, subtitle: null };
}
