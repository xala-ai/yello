'use client';

import { Moc } from '@/types/rebrickable';
import { ExternalLink, User, Calendar } from 'lucide-react';
import Image from 'next/image';

interface MocCardProps {
    moc: Moc;
}

export function MocCard({ moc }: MocCardProps) {
    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-all group flex flex-col h-full">
            <div className="relative aspect-video w-full bg-gray-50 overflow-hidden">
                <Image
                    src={moc.moc_img_url}
                    alt={moc.name}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                     <a
                        href={moc.moc_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white font-bold flex items-center gap-2 hover:underline"
                    >
                        View Instructions <ExternalLink className="w-4 h-4" />
                    </a>
                </div>
            </div>

            <div className="p-4 flex flex-col flex-1">
                <h3 className="font-bold text-gray-900 line-clamp-2 mb-2" title={moc.name}>{moc.name}</h3>

                <div className="mt-auto space-y-2 text-sm text-gray-500">
                    <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        <span className="truncate">By {moc.designer_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        <span>{moc.year} • {moc.num_parts} parts</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
