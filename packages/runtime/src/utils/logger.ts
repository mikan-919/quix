import consola from 'consola'

let _logger: ReturnType<typeof consola.withTag> | null = null

export const createLogger = (tag: string) => {
  if (!_logger) {
    _logger = consola.withTag('Quix')
  }
  return _logger.withTag(tag)
}

export const resetLogger = () => {
  _logger = null
}
