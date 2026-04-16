interface AudioMeterProps {
  level: number // 0-1
  isActive: boolean
  wide?: boolean
}

export const AudioMeter = ({ level, isActive, wide = false }: AudioMeterProps) => {
  const bars = wide ? 40 : 24
  const activeBars = isActive ? Math.round(level * bars) : 0

  return (
    <div className="flex items-center gap-0.5 flex-shrink-0" style={{ width: wide ? 140 : 80 }}>
      {Array.from({ length: bars }, (_, i) => {
        const active = i < activeBars
        const color = active
          ? i < bars * 0.6 ? '#30d158' : i < bars * 0.85 ? '#ff9f0a' : '#ff453a'
          : 'var(--bg-tertiary)'
        return (
          <div
            key={i}
            className="rounded-sm transition-all duration-75"
            style={{
              flex: 1,
              height: active ? (6 + Math.min(6, i * 0.4)) + 'px' : '3px',
              backgroundColor: color,
              opacity: isActive ? 1 : 0.4,
            }}
          />
        )
      })}
    </div>
  )
}
