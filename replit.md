# Discord Staff Bot

## Overview
A Discord bot that allows administrators to send alert messages to specific channels using slash commands.

## Features
- `/alert` command - Send messages to any channel (admin-only)
  - Parameters:
    - `canal`: Select the target channel
    - `mensaje`: The message to send

## Tech Stack
- Node.js 20
- discord.js v14
- dotenv for environment management

## Required Secrets
- `DISCORD_TOKEN`: Bot authentication token
- `CLIENT_ID`: Discord application ID

## Structure
- `index.js`: Main bot file with command handling
- `deploy-commands.js`: Script to register slash commands with Discord
- `package.json`: Project dependencies and scripts

## Recent Changes
- November 9, 2025: Initial setup with alert command functionality
