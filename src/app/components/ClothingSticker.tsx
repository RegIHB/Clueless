interface ClothingStickerProps {
  type: string;
  code: string;
}

export function ClothingSticker({ type, code }: ClothingStickerProps) {
  const getClothingStyle = () => {
    switch (type.toLowerCase()) {
      case 'bra':
        return {
          top: '22%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '35%',
          height: '15%'
        };
      case 'top':
      case 'bodysuit':
        return {
          top: '18%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '42%',
          height: '25%'
        };
      case 'dress':
        return {
          top: '18%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '45%',
          height: '45%'
        };
      case 'turtleneck':
      case 'sweater':
        return {
          top: '15%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '48%',
          height: '28%'
        };
      case 'jacket':
      case 'coat':
        return {
          top: '14%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '55%',
          height: '35%'
        };
      case 'pants':
        return {
          top: '42%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '38%',
          height: '40%'
        };
      case 'shorts':
        return {
          top: '42%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '38%',
          height: '22%'
        };
      case 'underwear':
        return {
          top: '38%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '32%',
          height: '15%'
        };
      case 'hat':
        return {
          top: '2%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '28%',
          height: '12%'
        };
      case 'scarf':
        return {
          top: '18%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '35%',
          height: '8%'
        };
      case 'belt':
        return {
          top: '40%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '36%',
          height: '5%'
        };
      case 'bag':
        return {
          top: '35%',
          left: '70%',
          transform: 'translateX(-50%)',
          width: '20%',
          height: '25%'
        };
      case 'skirt':
        return {
          top: '42%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '42%',
          height: '25%'
        };
      default:
        return {
          top: '30%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '40%',
          height: '30%'
        };
    }
  };

  const getClothingColor = () => {
    // Vary colors based on item code for variety
    const colors = [
      '#1a1a1a', // Black
      '#2d2d2d', // Dark gray
      '#4a5568', // Gray
      '#2c5282', // Navy
      '#742a2a', // Burgundy
      '#234e52', // Teal
      '#5f370e', // Brown
    ];
    const index = code.charCodeAt(code.length - 1) % colors.length;
    return colors[index];
  };

  const style = getClothingStyle();
  const color = getClothingColor();

  return (
    <div
      className="absolute rounded-lg flex items-center justify-center"
      style={{
        ...style,
        background: `linear-gradient(135deg, ${color} 0%, ${color}dd 100%)`,
        border: '2px solid rgba(0, 0, 0, 0.2)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        zIndex: 10
      }}
    >
      {/* Clothing texture/pattern overlay */}
      <div className="absolute inset-0 opacity-10 rounded-lg" style={{
        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,.1) 10px, rgba(255,255,255,.1) 20px)'
      }} />

      {/* Optional: Add subtle highlights */}
      <div className="absolute inset-0 rounded-lg" style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 50%, rgba(0,0,0,0.1) 100%)'
      }} />
    </div>
  );
}
