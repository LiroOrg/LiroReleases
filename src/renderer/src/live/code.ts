export function codeFromInput(raw: string): string {
  const link = raw.match(/connect[/:]?([a-z0-9-]+)/i)
  const digits = (link ? link[1] : raw).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 9)
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)].filter((part) => part).join('-')
}
