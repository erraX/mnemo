import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'
type Size = 'md' | 'lg'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-white',
  secondary: 'bg-easy-bg text-accent',
  ghost: 'bg-transparent text-accent',
}
const SIZE: Record<Size, string> = { md: 'h-11 px-4 text-[15px]', lg: 'h-[50px] px-5 text-base' }

export function Button({
  variant = 'primary', size = 'md', className = '', children, type = 'button', ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; ref?: Ref<HTMLButtonElement>; children: ReactNode }) {
  return (
    <button
      type={type}
      className={`rounded-(--radius-card) font-semibold disabled:opacity-40 ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
