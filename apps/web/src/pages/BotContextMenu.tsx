import { useLingui } from "@lingui/react/macro";
import type { Bot, BotSection } from "@rakazo/contracts";
import {
  BotAvatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@rakazo/ui-web";
import {
  Archive,
  Bell,
  BellDot,
  Check,
  Copy,
  CornerDownRight,
  CornerUpLeft,
  Eraser,
  Folder,
  FolderPlus,
  Pencil,
  Pin,
  Star,
  Trash2,
} from "lucide-react";

export type ContextMenuPosition = { x: number; y: number };

type ChatMenuTarget = Pick<Bot, "name" | "pinned" | "sectionId" | "unread"> & {
  /** Bots only; the Primary can't be deleted, and others can become it. */
  primary?: boolean;
  /** Bots only; a nested bot can't be pinned. */
  parentBotId?: string | null;
};
type NestTarget = Pick<Bot, "id" | "name" | "color">;

export function BotContextMenu({
  bot,
  position,
  onClose,
  onTogglePinned,
  sections,
  canMove = true,
  onMoveToSection,
  onCreateSection,
  onRenameSection,
  nestTargets = [],
  onNest,
  parentName,
  onUnnest,
  onMakePrimary,
  onToggleUnread,
  onEdit,
  onDuplicate,
  onClear,
  onArchive,
  onDelete,
}: {
  bot: ChatMenuTarget;
  position: ContextMenuPosition;
  onClose: () => void;
  onTogglePinned: () => void;
  sections: BotSection[];
  /** False for a bot nested under an unpinned parent: it moves with the parent. */
  canMove?: boolean;
  onMoveToSection: (sectionId: string | null) => void;
  onCreateSection: () => void;
  onRenameSection?: (sectionId: string) => void;
  /** Top-level bots this bot can nest under; none for groups or bots with nested bots. */
  nestTargets?: NestTarget[];
  onNest?: (parentBotId: string) => void;
  /** Set for a nested bot. */
  parentName?: string;
  onUnnest?: () => void;
  /** Bots only. */
  onMakePrimary?: () => void;
  onToggleUnread: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onClear: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const { t } = useLingui();

  return (
    <DropdownMenu
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {/* Invisible anchor at the pointer position; the menu itself carries the accessible name. */}
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className="fixed size-0 p-0 opacity-0"
            style={{ left: position.x, top: position.y }}
          />
        }
      />
      <DropdownMenuContent
        aria-label={t`Actions for ${bot.name}`}
        align="start"
        sideOffset={0}
        className="max-h-[min(420px,calc(100vh-16px))] w-auto"
      >
        {bot.parentBotId ? null : (
          <DropdownMenuItem onClick={onTogglePinned}>
            <Pin />
            {bot.pinned ? t`Unpin` : t`Pin`}
          </DropdownMenuItem>
        )}
        {canMove ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Folder />
              {t`Move to`}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-[min(420px,calc(100vh-16px))]">
              {sections.map((section) => (
                <DropdownMenuItem key={section.id} onClick={() => onMoveToSection(section.id)}>
                  {bot.sectionId === section.id ? <Check /> : <Folder />}
                  <span dir="auto">{section.name}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => onMoveToSection(null)}>
                {bot.sectionId === null ? <Check /> : <Folder />}
                {t`Unassigned`}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onCreateSection}>
                <FolderPlus />
                {t`New section`}
              </DropdownMenuItem>
              {bot.sectionId && onRenameSection ? (
                <DropdownMenuItem onClick={() => onRenameSection(bot.sectionId!)}>
                  <Pencil />
                  {t`Rename section`}
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        {nestTargets.length > 0 && onNest ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <CornerDownRight />
              {t`Nest under`}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-[min(420px,calc(100vh-16px))]">
              {nestTargets.map((target) => (
                <DropdownMenuItem key={target.id} onClick={() => onNest(target.id)}>
                  <BotAvatar color={target.color} identity={target.id} size={16} />
                  <span dir="auto">{target.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        {parentName && onUnnest ? (
          <DropdownMenuItem onClick={onUnnest}>
            <CornerUpLeft />
            <span dir="auto">{t`Move out of ${parentName}`}</span>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={onToggleUnread}>
          {bot.unread ? <BellDot /> : <Bell />}
          {bot.unread ? t`Mark as Read` : t`Mark as Unread`}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onEdit}>
          <Pencil />
          {t`Edit Profile`}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDuplicate}>
          <Copy />
          {t`Duplicate`}
        </DropdownMenuItem>
        {onMakePrimary && bot.primary === false ? (
          <DropdownMenuItem onClick={onMakePrimary}>
            <Star />
            {t`Make primary`}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onClear}>
          <Eraser />
          {t`Clear conversation`}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onArchive}>
          <Archive />
          {t`Archive`}
        </DropdownMenuItem>
        {bot.primary ? null : (
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 />
            {t`Delete`}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
