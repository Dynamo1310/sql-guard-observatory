/**
 * Password Input con generador de contraseñas estilo Passbolt
 */
import { useState, useCallback } from 'react';
import { Eye, EyeOff, Dices, Copy, Check, Wand2, Settings2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface PasswordInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  showStrengthIndicator?: boolean;
}

interface GeneratorOptions {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
}

const DEFAULT_OPTIONS: GeneratorOptions = {
  length: 16,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
};

const CHAR_SETS = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
};

function generatePassword(options: GeneratorOptions): string {
  let chars = '';
  let password = '';
  
  // Construir el conjunto de caracteres
  if (options.uppercase) chars += CHAR_SETS.uppercase;
  if (options.lowercase) chars += CHAR_SETS.lowercase;
  if (options.numbers) chars += CHAR_SETS.numbers;
  if (options.symbols) chars += CHAR_SETS.symbols;
  
  // Si no hay caracteres seleccionados, usar lowercase por defecto
  if (!chars) {
    chars = CHAR_SETS.lowercase;
  }
  
  // Generar la contraseña
  const array = new Uint32Array(options.length);
  crypto.getRandomValues(array);
  
  for (let i = 0; i < options.length; i++) {
    password += chars[array[i] % chars.length];
  }
  
  // Asegurar que tenga al menos un carácter de cada tipo seleccionado
  let finalPassword = password.split('');
  let position = 0;
  
  if (options.uppercase && !finalPassword.some(c => CHAR_SETS.uppercase.includes(c))) {
    const randomChar = CHAR_SETS.uppercase[Math.floor(Math.random() * CHAR_SETS.uppercase.length)];
    finalPassword[position++ % options.length] = randomChar;
  }
  if (options.lowercase && !finalPassword.some(c => CHAR_SETS.lowercase.includes(c))) {
    const randomChar = CHAR_SETS.lowercase[Math.floor(Math.random() * CHAR_SETS.lowercase.length)];
    finalPassword[position++ % options.length] = randomChar;
  }
  if (options.numbers && !finalPassword.some(c => CHAR_SETS.numbers.includes(c))) {
    const randomChar = CHAR_SETS.numbers[Math.floor(Math.random() * CHAR_SETS.numbers.length)];
    finalPassword[position++ % options.length] = randomChar;
  }
  if (options.symbols && !finalPassword.some(c => CHAR_SETS.symbols.includes(c))) {
    const randomChar = CHAR_SETS.symbols[Math.floor(Math.random() * CHAR_SETS.symbols.length)];
    finalPassword[position++ % options.length] = randomChar;
  }
  
  // Mezclar el resultado
  for (let i = finalPassword.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [finalPassword[i], finalPassword[j]] = [finalPassword[j], finalPassword[i]];
  }
  
  return finalPassword.join('');
}

function calculateStrength(password: string): { score: number; label: string; color: string } {
  if (!password) return { score: 0, label: 'Sin contraseña', color: 'bg-muted' };
  
  let score = 0;
  
  // Longitud
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  if (password.length >= 20) score += 1;
  
  // Complejidad
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  
  // Variedad de caracteres
  const uniqueChars = new Set(password).size;
  if (uniqueChars >= password.length * 0.7) score += 1;
  
  // Normalizar a 0-4
  const normalizedScore = Math.min(4, Math.floor(score / 2.25));
  
  const levels = [
    { label: 'Muy débil', color: 'bg-destructive' },
    { label: 'Débil', color: 'bg-destructive' },
    { label: 'Media', color: 'bg-warning' },
    { label: 'Fuerte', color: 'bg-success' },
    { label: 'Muy fuerte', color: 'bg-success' },
  ];
  
  return { score: normalizedScore, ...levels[normalizedScore] };
}

export function PasswordInput({
  id,
  value,
  onChange,
  placeholder = 'Ingresa la contraseña',
  disabled = false,
  className,
  showStrengthIndicator = true,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [options, setOptions] = useState<GeneratorOptions>(DEFAULT_OPTIONS);
  
  const strength = calculateStrength(value);
  
  const handleGenerate = useCallback(() => {
    const newPassword = generatePassword(options);
    onChange(newPassword);
    setShowPassword(true); // Mostrar la contraseña generada
    toast.success('Contraseña generada');
  }, [options, onChange]);
  
  const handleCopy = useCallback(async () => {
    if (!value) return;
    
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('Contraseña copiada');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Error al copiar');
    }
  }, [value]);
  
  const handleQuickGenerate = useCallback(() => {
    const newPassword = generatePassword(options);
    onChange(newPassword);
    setShowPassword(true);
    toast.success('Contraseña generada');
  }, [options, onChange]);
  
  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative flex gap-1">
        <div className="relative flex-1">
          <Input
            id={id}
            type={showPassword ? 'text' : 'password'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className="pr-10 font-mono"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
            onClick={() => setShowPassword(!showPassword)}
            disabled={disabled}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
          </Button>
        </div>
        
        {/* Botón de copiar */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleCopy}
          disabled={disabled || !value}
          title="Copiar contraseña"
          className="flex-shrink-0"
        >
          {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
        </Button>
        
        {/* Botón de generar rápido */}
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleQuickGenerate}
          disabled={disabled}
          title="Generar contraseña"
          className="flex-shrink-0"
        >
          <Dices className="h-4 w-4" />
        </Button>
        
        {/* Popover de opciones de generación */}
        <Popover open={generatorOpen} onOpenChange={setGeneratorOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={disabled}
              title="Opciones de generación"
              className="flex-shrink-0"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="end">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-primary" />
                  Generador de Contraseñas
                </h4>
              </div>
              
              {/* Longitud */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Longitud</Label>
                  <span className="text-sm font-mono font-medium w-8 text-right">{options.length}</span>
                </div>
                <Slider
                  value={[options.length]}
                  onValueChange={([value]) => setOptions({ ...options, length: value })}
                  min={8}
                  max={64}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>8</span>
                  <span>64</span>
                </div>
              </div>
              
              {/* Opciones de caracteres */}
              <div className="space-y-3">
                <Label className="text-sm">Caracteres incluidos</Label>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm bg-muted px-2 py-0.5 rounded">A-Z</span>
                    <span className="text-sm text-muted-foreground">Mayúsculas</span>
                  </div>
                  <Switch
                    checked={options.uppercase}
                    onCheckedChange={(checked) => setOptions({ ...options, uppercase: checked })}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm bg-muted px-2 py-0.5 rounded">a-z</span>
                    <span className="text-sm text-muted-foreground">Minúsculas</span>
                  </div>
                  <Switch
                    checked={options.lowercase}
                    onCheckedChange={(checked) => setOptions({ ...options, lowercase: checked })}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm bg-muted px-2 py-0.5 rounded">0-9</span>
                    <span className="text-sm text-muted-foreground">Números</span>
                  </div>
                  <Switch
                    checked={options.numbers}
                    onCheckedChange={(checked) => setOptions({ ...options, numbers: checked })}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm bg-muted px-2 py-0.5 rounded">!@#</span>
                    <span className="text-sm text-muted-foreground">Símbolos</span>
                  </div>
                  <Switch
                    checked={options.symbols}
                    onCheckedChange={(checked) => setOptions({ ...options, symbols: checked })}
                  />
                </div>
              </div>
              
              {/* Vista previa de caracteres */}
              <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded font-mono break-all">
                {options.uppercase && CHAR_SETS.uppercase}
                {options.lowercase && CHAR_SETS.lowercase}
                {options.numbers && CHAR_SETS.numbers}
                {options.symbols && CHAR_SETS.symbols}
              </div>
              
              {/* Botón de generar */}
              <Button 
                type="button" 
                className="w-full" 
                onClick={() => {
                  handleGenerate();
                  setGeneratorOpen(false);
                }}
              >
                <Wand2 className="h-4 w-4 mr-2" />
                Generar Contraseña
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      
      {/* Indicador de fortaleza */}
      {showStrengthIndicator && value && (
        <div className="space-y-1">
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  i <= strength.score ? strength.color : "bg-muted"
                )}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Fortaleza: <span className="font-medium">{strength.label}</span>
          </p>
        </div>
      )}
    </div>
  );
}

export default PasswordInput;

