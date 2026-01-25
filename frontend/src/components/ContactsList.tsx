import { useState, useEffect, useCallback } from 'react';
import { Search, Users, Phone, MapPin, Loader2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { contactsService, Contact } from '@/services/api';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';

interface ContactsListProps {
  onCall: (phoneNumber: string) => void;
  onSelectContact?: (contact: Contact) => void;
  className?: string;
}

export function ContactsList({ onCall, onSelectContact, className }: ContactsListProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);

  const fetchContacts = useCallback(async (query?: string) => {
    try {
      if (query) {
        setIsSearching(true);
      } else {
        setIsLoading(true);
      }
      const results = await contactsService.search(query, 50);
      setContacts(results);
    } catch (error) {
      console.error('Error fetching contacts:', error);
    } finally {
      setIsLoading(false);
      setIsSearching(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        fetchContacts(searchQuery);
      } else {
        fetchContacts();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, fetchContacts]);

  const handleCallClick = (e: React.MouseEvent, contact: Contact) => {
    e.stopPropagation();
    if (contact.phone) {
      onCall(contact.phone);
    }
  };

  const handleContactClick = (contact: Contact) => {
    onSelectContact?.(contact);
  };

  const filteredContacts = contacts.filter(c => c.phone); // Only show contacts with phone

  return (
    <div className={cn('modern-card flex flex-col h-full overflow-hidden', className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/30 flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center border border-violet-500/20">
              <Users className="w-4 h-4 text-violet-400" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Contatos</h3>
              <span className="text-xs text-muted-foreground">
                {isLoading ? 'Carregando...' : `${filteredContacts.length} contatos`}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-violet-500/10"
            onClick={() => fetchContacts(searchQuery || undefined)}
            disabled={isLoading || isSearching}
          >
            <RefreshCw className={cn('w-4 h-4', (isLoading || isSearching) && 'animate-spin')} />
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <Input
            type="text"
            placeholder="Buscar por nome ou telefone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9 bg-muted/20 border-border/30 rounded-lg text-sm"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Contacts List */}
      <ScrollArea className="flex-1 min-h-0">
        {isLoading && !isSearching ? (
          <div className="py-12 text-center text-muted-foreground">
            <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm">Carregando contatos...</p>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-2 border border-border/30">
              <Users className="w-5 h-5 opacity-50" />
            </div>
            <p className="text-sm">
              {searchQuery ? 'Nenhum contato encontrado' : 'Nenhum contato'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {filteredContacts.map((contact) => (
              <div
                key={contact.id}
                onClick={() => handleContactClick(contact)}
                className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted/30 cursor-pointer transition-colors group"
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500/20 to-violet-600/10 flex items-center justify-center border border-violet-500/20 shrink-0">
                  <span className="text-sm font-semibold text-violet-400">
                    {contact.name?.charAt(0).toUpperCase() || '?'}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{contact.name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">{contact.phone}</span>
                    {contact.state && (
                      <>
                        <span className="text-border">|</span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {contact.state}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Call button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 hover:bg-emerald-500/10 transition-all"
                  onClick={(e) => handleCallClick(e, contact)}
                  title="Ligar"
                >
                  <Phone className="w-4 h-4 text-emerald-400" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
