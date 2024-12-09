if [ -f ~/.bashrc ]; then
    source ~/.bashrc
fi

# https://docs.deno.com/runtime/reference/cli/completions/
# but without modifying files

# tmppipe=$(mktemp -u)
# mkfifo -m 600 "$tmppipe"
# deno completions bash > $tmppipe &
# source $tmppipe
# rm $tmppipe

# actually you can just do this lmao
source <(deno completions bash)

echo "sourced deno completions"