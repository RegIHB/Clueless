interface ClothingIconProps {
  type: string;
}

export function ClothingIcon({ type }: ClothingIconProps) {
  const getClothingPath = () => {
    switch (type.toLowerCase()) {
      case 'bra':
        return (
          <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
            <path d="M20 30 Q25 20 35 20 Q40 20 45 25 L50 30 L55 25 Q60 20 65 20 Q75 20 80 30 L75 50 Q70 55 65 55 L60 50 L55 45 L50 50 L45 45 L40 50 L35 55 Q30 55 25 50 Z" />
          </svg>
        );
      case 'top':
        return (
          <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
            <path d="M25 20 L35 15 L50 20 L65 15 L75 20 L75 70 L25 70 Z" />
          </svg>
        );
      case 'dress':
        return (
          <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
            <path d="M30 15 L40 10 L50 15 L60 10 L70 15 L65 40 L75 85 L25 85 L35 40 Z" />
          </svg>
        );
      case 'bodysuit':
        return (
          <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
            <path d="M30 15 L40 10 L50 15 L60 10 L70 15 L70 50 Q70 55 65 55 L65 85 L35 85 L35 55 Q30 55 30 50 Z" />
          </svg>
        );
      case 'turtleneck':
        return (
          <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
            <path d="M35 10 L40 5 L50 8 L60 5 L65 10 L65 20 L35 20 Z M25 20 L35 15 L50 20 L65 15 L75 20 L75 70 L25 70 Z" />
          </svg>
        );
      case 'sweater':
        return (
          <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
            <path d="M20 25 L30 15 L40 20 L50 15 L60 20 L70 15 L80 25 L80 75 L20 75 Z" />
          </svg>
        );
      case 'jacket':
      case 'coat':
        return (
          <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
            <path d="M25 20 L35 10 L45 15 L48 20 L52 20 L55 15 L65 10 L75 20 L75 85 L60 85 L60 40 L50 45 L40 40 L40 85 L25 85 Z" />
          </svg>
        );
      case 'pants':
        return (
          <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
            <path d="M30 15 L70 15 L68 50 L65 85 L55 85 L52 50 L50 40 L48 50 L45 85 L35 85 L32 50 Z" />
          </svg>
        );
      case 'underwear':
        return (
          <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
            <path d="M25 35 L30 30 L40 30 L45 35 L50 40 L55 35 L60 30 L70 30 L75 35 L72 55 L28 55 Z" />
          </svg>
        );
      case 'shorts':
        return (
          <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
            <path d="M30 25 L70 25 L68 45 L65 60 L55 60 L52 45 L50 40 L48 45 L45 60 L35 60 L32 45 Z" />
          </svg>
        );
      case 'skirt':
        return (
          <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
            <path d="M35 25 L65 25 L75 65 L25 65 Z" />
          </svg>
        );
      case 'hat':
        return (
          <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
            <ellipse cx="50" cy="55" rx="30" ry="8" />
            <path d="M35 55 Q35 25 50 20 Q65 25 65 55 Z" />
          </svg>
        );
      case 'scarf':
        return (
          <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
            <path d="M20 40 Q30 30 40 35 L50 40 L60 35 Q70 30 80 40 L75 55 Q65 50 60 52 L50 55 L40 52 Q35 50 25 55 Z" />
          </svg>
        );
      case 'belt':
        return (
          <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
            <rect x="20" y="45" width="60" height="10" rx="2" />
            <rect x="70" y="42" width="8" height="16" rx="1" />
          </svg>
        );
      case 'bag':
        return (
          <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
            <path d="M30 30 L70 30 L75 70 L25 70 Z" />
            <path d="M35 30 Q35 20 50 20 Q65 20 65 30" fill="none" stroke="currentColor" strokeWidth="3" />
          </svg>
        );
      case 'sneakers':
      case 'flats':
      case 'loafers':
        return (
          <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
            <path d="M15 55 L30 45 L45 42 L70 45 L85 55 L85 65 L15 65 Z" />
          </svg>
        );
      case 'boots':
        return (
          <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
            <path d="M35 20 L65 20 L65 55 L80 60 L80 75 L20 75 L20 60 L35 55 Z" />
          </svg>
        );
      case 'heels':
        return (
          <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
            <path d="M30 30 L50 28 L65 35 L80 55 L80 65 L20 65 L20 60 L25 55 Z" />
            <rect x="25" y="65" width="6" height="15" rx="1" />
          </svg>
        );
      case 'sandals':
        return (
          <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
            <path d="M20 60 L80 60 L85 70 L15 70 Z" />
            <path d="M30 50 L50 45 L70 50" fill="none" stroke="currentColor" strokeWidth="4" />
          </svg>
        );
      case 'blazer':
      case 'vest':
        return (
          <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
            <path d="M25 20 L35 10 L45 15 L48 20 L52 20 L55 15 L65 10 L75 20 L75 85 L60 85 L60 40 L50 45 L40 40 L40 85 L25 85 Z" />
          </svg>
        );
      case 'hoodie':
        return (
          <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
            <path d="M20 25 L30 15 L40 20 L50 15 L60 20 L70 15 L80 25 L80 75 L20 75 Z" />
            <path d="M40 15 Q50 8 60 15" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        );
      case 'sunglasses':
        return (
          <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
            <ellipse cx="35" cy="50" rx="15" ry="12" />
            <ellipse cx="65" cy="50" rx="15" ry="12" />
            <path d="M50 50 L50 50" fill="none" stroke="currentColor" strokeWidth="3" />
            <path d="M20 48 L15 45" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M80 48 L85 45" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        );
      case 'jewellery':
        return (
          <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
            <circle cx="50" cy="50" r="20" fill="none" stroke="currentColor" strokeWidth="4" />
            <circle cx="50" cy="30" r="6" />
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 100 100" fill="currentColor" className="w-full h-full">
            <rect x="30" y="20" width="40" height="60" rx="5" />
          </svg>
        );
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center text-black/90">
      {getClothingPath()}
    </div>
  );
}
