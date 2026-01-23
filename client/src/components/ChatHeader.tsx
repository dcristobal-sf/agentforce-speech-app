import { ArrowLeft, Settings, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ChatHeaderProps {
  agentName?: string;
  isOnline?: boolean;
  onBack?: () => void;
  onSettings?: () => void;
  language?: 'english' | 'spanish';
  onLanguageChange?: (language: 'english' | 'spanish') => void;
}

export default function ChatHeader({
  agentName = "Agentforce",
  isOnline = true,
  onBack,
  onSettings,
  language = 'english',
  onLanguageChange
}: ChatHeaderProps) {
  return (
    <header className="flex items-center justify-between p-lg border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-50">
      <div className="flex items-center gap-md">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={onBack}
          data-testid="button-back"
          className="w-8 h-8"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        
        <div className="flex items-center gap-md">
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-semibold text-sm">A</span>
            </div>
            {isOnline && (
              <div 
                className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-recording-active border-2 border-background rounded-full"
                data-testid="status-online"
              />
            )}
          </div>
          
          <div>
            <h1 className="font-semibold text-foreground text-lg" data-testid="text-agent-name">
              {agentName}
            </h1>
            <p className="text-xs text-muted-foreground" data-testid="text-status">
              {isOnline ? 'Online' : 'Offline'}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              data-testid="button-language"
              className="w-8 h-8"
            >
              <Languages className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => onLanguageChange?.('english')}
              className={language === 'english' ? 'bg-accent' : ''}
            >
              🇬🇧 English
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onLanguageChange?.('spanish')}
              className={language === 'spanish' ? 'bg-accent' : ''}
            >
              🇪🇸 Español
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="ghost"
          size="icon"
          onClick={onSettings}
          data-testid="button-settings"
          className="w-8 h-8"
        >
          <Settings className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
}