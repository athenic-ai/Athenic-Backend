/**
 * Types for the Dump application
 */

/**
 * Represents the metadata structure for a dump object
 */
export interface DumpMetadata {
  /**
   * A concise summary of the dump
   */
  title: string;
  
  /**
   * The full content of the dump in markdown format
   */
  description: string;
  
  /**
   * If the input implies a due date or reminder time (ISO8601 format)
   */
  due_date: string | null;
  
  /**
   * Set to false if due_date is present, otherwise null
   */
  is_completed: boolean | null;
  
  /**
   * Priority level (e.g., "1" for low, "2" for medium, "3" for high)
   */
  priority: string | null;
  
  /**
   * Hex color code for the dump's primary color
   */
  colour_primary: string;
  
  /**
   * Font Awesome icon code (e.g., "solid note-sticky", "solid calendar-days")
   */
  icon: string;
  
  /**
   * When the dump was created (ISO8601 format)
   */
  created_at: string;
  
  /**
   * When the dump was last updated (ISO8601 format)
   */
  updated_at: string;
  
  /**
   * Optional ID of parent dump if this dump is a child
   */
  parent_id: string | null;
  
  /**
   * Optional map of child IDs categorized by type
   */
  child_ids?: Record<string, string[]>;
} 