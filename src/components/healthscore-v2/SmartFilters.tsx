import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';

interface SmartFiltersProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filterAmbiente: string;
  setFilterAmbiente: (ambiente: string) => void;
  ambientes: string[];
  className?: string;
}

export function SmartFilters({
  searchQuery,
  setSearchQuery,
  filterAmbiente,
  setFilterAmbiente,
  ambientes,
  className,
}: SmartFiltersProps) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar instancia..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-9 bg-background"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Environment Pills */}
      <div className="flex flex-wrap gap-1.5">
        <FilterPill
          label="Todos"
          isActive={filterAmbiente === 'All'}
          onClick={() => setFilterAmbiente('All')}
        />
        {ambientes.map((amb) => (
          <FilterPill
            key={amb}
            label={amb}
            isActive={filterAmbiente === amb}
            onClick={() => setFilterAmbiente(amb)}
          />
        ))}
      </div>
    </div>
  );
}

interface FilterPillProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}

function FilterPill({ label, isActive, onClick }: FilterPillProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 text-xs rounded-full transition-colors',
        isActive
          ? 'bg-foreground text-background'
          : 'bg-muted hover:bg-muted/80 text-muted-foreground'
      )}
    >
      {label}
    </button>
  );
}
