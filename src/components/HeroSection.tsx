type Props = {
  title: string
  description?: string
}

export function HeroSection({ title, description }: Props) {
  return (
    <div className="bg-[#1e3a5f] py-10">
      <div className="mx-auto max-w-[1100px] px-4">
        <h1 className="text-[26px] font-bold text-white">{title}</h1>
        {description && (
          <p className="mt-2 text-[14px] text-white/80">{description}</p>
        )}
      </div>
    </div>
  )
}
