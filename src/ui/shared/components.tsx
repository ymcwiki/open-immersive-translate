import type { ComponentChildren, JSX } from "preact";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  id?: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export function Select({
  id,
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
}: SelectProps): JSX.Element {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.currentTarget.value)}
    >
      {options.map((option) => (
        <option
          key={option.value}
          value={option.value}
          disabled={option.disabled}
        >
          {option.label}
        </option>
      ))}
    </select>
  );
}

interface ToggleProps {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Toggle({
  checked,
  label,
  onChange,
  disabled,
}: ToggleProps): JSX.Element {
  return (
    <label class="ui-toggle">
      <span>{label}</span>
      <span class="ui-toggle-control">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-label={label}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        <span aria-hidden="true" class="ui-toggle-track" />
      </span>
    </label>
  );
}

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ComponentChildren;
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: FieldProps): JSX.Element {
  return (
    <div class="ui-field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <small>{hint}</small>}
    </div>
  );
}

type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "quiet";
};

export function Button({
  variant = "secondary",
  class: className,
  type = "button",
  ...props
}: ButtonProps): JSX.Element {
  return (
    <button
      {...props}
      type={type}
      class={["ui-button", `ui-button-${variant}`, className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

interface CardProps {
  title?: string;
  actions?: ComponentChildren;
  children: ComponentChildren;
  className?: string;
}

export function Card({
  title,
  actions,
  children,
  className,
}: CardProps): JSX.Element {
  return (
    <section class={["ui-card", className].filter(Boolean).join(" ")}>
      {(title || actions) && (
        <header class="ui-card-header">
          {title && <h2>{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}
