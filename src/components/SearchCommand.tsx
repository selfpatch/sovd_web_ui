import { useState, useEffect, useCallback } from 'react';
import { useShallow } from 'zustand/shallow';
import { Layers, Box, Cpu, GitBranch, Search } from 'lucide-react';
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { useAppStore } from '@/lib/store';
import type { EntityTreeNode } from '@/lib/types';

/**
 * Flatten tree nodes for search indexing
 */
function flattenTree(nodes: EntityTreeNode[]): EntityTreeNode[] {
    const result: EntityTreeNode[] = [];

    for (const node of nodes) {
        // Skip virtual folders (data, operations, configurations, faults)
        if (node.type === 'virtual-folder') continue;

        result.push(node);

        if (node.children && node.children.length > 0) {
            result.push(...flattenTree(node.children));
        }
    }

    return result;
}

/**
 * Get icon for entity type
 */
function getEntityIcon(type: string) {
    switch (type) {
        case 'area':
            return Layers;
        case 'component':
            return Box;
        case 'app':
            return Cpu;
        case 'function':
            return GitBranch;
        default:
            return Search;
    }
}

/**
 * Get color class for entity type
 */
function getEntityColorClass(type: string): string {
    switch (type) {
        case 'area':
            return 'text-cyan-500';
        case 'component':
            return 'text-indigo-500';
        case 'app':
            return 'text-emerald-500';
        case 'function':
            return 'text-violet-500';
        default:
            return 'text-muted-foreground';
    }
}

interface SearchCommandProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Search Command Palette - Ctrl+K to open
 *
 * Allows quick navigation to any entity in the tree.
 */
export function SearchCommand({ open, onOpenChange }: SearchCommandProps) {
    const [search, setSearch] = useState('');

    const { rootEntities, selectEntity, isConnected } = useAppStore(
        useShallow((state) => ({
            rootEntities: state.rootEntities,
            selectEntity: state.selectEntity,
            isConnected: state.isConnected,
        }))
    );

    // Flatten tree for searching
    const allEntities = flattenTree(rootEntities);

    // Filter entities based on search
    const filteredEntities = search
        ? allEntities.filter(
              (entity) =>
                  entity.name.toLowerCase().includes(search.toLowerCase()) ||
                  entity.id.toLowerCase().includes(search.toLowerCase()) ||
                  entity.path.toLowerCase().includes(search.toLowerCase())
          )
        : allEntities.slice(0, 20); // Show first 20 when no search

    const handleSelect = useCallback(
        (path: string) => {
            selectEntity(path);
            onOpenChange(false);
            setSearch('');
        },
        [selectEntity, onOpenChange]
    );

    // Clear search when closing
    useEffect(() => {
        if (!open) {
            setSearch('');
        }
    }, [open]);

    if (!isConnected) {
        return (
            <CommandDialog open={open} onOpenChange={onOpenChange}>
                <CommandInput placeholder="Search entities..." disabled />
                <CommandList>
                    <CommandEmpty>Connect to a server first.</CommandEmpty>
                </CommandList>
            </CommandDialog>
        );
    }

    return (
        <CommandDialog open={open} onOpenChange={onOpenChange}>
            <CommandInput
                placeholder="Search entities by name, ID, or path..."
                value={search}
                onValueChange={setSearch}
            />
            <CommandList>
                <CommandEmpty>No entities found.</CommandEmpty>

                {/* Group by entity type */}
                {['area', 'component', 'app', 'function'].map((type) => {
                    const typeEntities = filteredEntities.filter((e) => e.type === type);
                    if (typeEntities.length === 0) return null;

                    const label = type.charAt(0).toUpperCase() + type.slice(1) + 's';

                    return (
                        <CommandGroup key={type} heading={label}>
                            {typeEntities.map((entity) => {
                                const EntityIcon = getEntityIcon(entity.type);
                                return (
                                    <CommandItem
                                        key={entity.path}
                                        value={`${entity.name} ${entity.id} ${entity.path}`}
                                        onSelect={() => handleSelect(entity.path)}
                                        className="cursor-pointer"
                                    >
                                        <EntityIcon className={`mr-2 h-4 w-4 ${getEntityColorClass(entity.type)}`} />
                                        <div className="flex flex-col">
                                            <span>{entity.name}</span>
                                            <span className="text-xs text-muted-foreground font-mono">
                                                {entity.path}
                                            </span>
                                        </div>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    );
                })}
            </CommandList>
        </CommandDialog>
    );
}
