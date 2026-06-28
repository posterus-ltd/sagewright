# Interactive shell config for the worker container.
# Loaded when someone `docker exec`s into the container for debugging.

# Only run for interactive shells.
case $- in
  *i*) ;;
    *) return ;;
esac

# --- History ---
export HISTSIZE=10000
export HISTFILESIZE=20000
export HISTCONTROL=ignoreboth        # no duplicate lines, ignore leading-space cmds
shopt -s histappend                  # append instead of overwriting
shopt -s checkwinsize                # keep $LINES/$COLUMNS up to date

# --- Editor ---
export EDITOR=nvim
export VISUAL=nvim

# --- Prompt: colored, shows cwd and git branch ---
git_branch() { git branch 2>/dev/null | sed -n 's/^\* \(.*\)/ (\1)/p'; }
export PS1='\[\e[32m\]\u@worker\[\e[0m\]:\[\e[34m\]\w\[\e[33m\]$(git_branch)\[\e[0m\]\$ '

# --- Color support ---
export CLICOLOR=1
if command -v dircolors >/dev/null 2>&1; then
  eval "$(dircolors -b)"
fi

# --- Aliases ---
alias ll='ls -alFh --color=auto'
alias la='ls -A --color=auto'
alias l='ls -CF --color=auto'
alias ls='ls --color=auto'
alias grep='grep --color=auto'
alias fgrep='fgrep --color=auto'
alias egrep='egrep --color=auto'

alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'

alias vi='nvim'
alias vim='nvim'

# Git shortcuts
alias g='git'
alias gs='git status'
alias gd='git diff'
alias gl='git log --oneline --graph --decorate -20'
alias gb='git branch'
alias gco='git checkout'

# Safety nets
alias rm='rm -i'
alias cp='cp -i'
alias mv='mv -i'
