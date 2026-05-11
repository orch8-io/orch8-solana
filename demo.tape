Output docs/crypto/assets/recoverable-migration-demo.gif
Set Shell "zsh"
Set FontSize 16
Set Width 960
Set Height 540
Set Padding 20
Set Theme "Catppuccin Mocha"

Set TypingSpeed 40ms

Type "echo 'Solana transactions are atomic. User operations are not.'"
Enter
Sleep 2s

Type "node dist/demo/recoverable-migration/src/run-demo.js"
Enter
Sleep 3s

Sleep 3s

Type "echo 'Same failure. Different outcome.'"
Enter
Sleep 2s

Type "head -60 demo/recoverable-migration/src/build-workflow.ts"
Enter
Sleep 4s

Type "echo 'orch8 turns this into a deployable workflow.'"
Enter
Sleep 2s
