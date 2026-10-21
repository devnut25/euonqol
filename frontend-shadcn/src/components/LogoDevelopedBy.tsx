import EUonQoLLogo from '@/assets/EUonQoL_logo.webp';

export const LogoDevelopedBy = () => (
  <div className="flex items-center gap-2">
    <span className="font-semibold text-sm md:text-base">Developed by</span>
    <img
      src={EUonQoLLogo}
      alt="EUonQoL Logo"
      width={233}
      height={140}
      className="w-12 md:w-16 h-auto"
    />
  </div>
);
