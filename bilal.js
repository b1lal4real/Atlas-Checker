const {
  Client,
  Intents,
  MessageEmbed,
  MessageActionRow,
  MessageButton,
  MessageAttachment
} = require('discord.js');
const { Client: UserClient } = require('discord.js-selfbot-v13');
const config = require('./config.json');

// Destructure config values
const {
  botToken,
  userToken,
  prefix,
  fullcheckCommand,
  topmaCommand,
  allowedUserIDs
} = config;

// Create Clients
const botClient = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_VOICE_STATES,
  ],
});
const userClient = new UserClient();

// Ready Events
botClient.once('ready', () => {
  console.log(`✅ Bot client ready as ${botClient.user.tag}`);
});

userClient.once('ready', () => {
  console.log(`✅ User client ready as ${userClient.user.tag}`);
});

// Handle Unhandled Rejections
process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);

// Login
botClient.login(botToken);
userClient.login(userToken);

// Command Handler
botClient.on('message', async (message) => {
  if (message.author.bot || !message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmd = args[0].toLowerCase();

  // Permission Check
  if (!allowedUserIDs.includes(message.author.id)) {
    return message.channel.send('❌ You do not have permission to use this command.');
  }

  // Handle Commands
  if (cmd === fullcheckCommand) {
    // fullcheck command
    if (!args[1]) {
      return message.channel.send(`❌ Usage: \`${prefix}${fullcheckCommand} <userID>\``);
    }

    const userID = args[1];
    try {
      const targetUser = await userClient.users.fetch(userID).catch(() => null);
      if (!targetUser) return message.channel.send('❌ The specified user was not found.');

      const embeds = [];

      for (const guild of userClient.guilds.cache.values()) {
        const member = await guild.members.fetch(userID).catch(() => null);
        if (!member) continue;

        const roles = member.roles.cache.map(r => r.name).join(', ') || 'No roles';
        const isOwner = guild.ownerId === userID ? 'Yes' : 'No';
        const isAdmin = member.permissions.has('ADMINISTRATOR') ? 'Yes' : 'No';
        const isBooster = member.premiumSince ? 'Yes' : 'No';

        const embed = new MessageEmbed()
          .setTitle(guild.name)
          .setThumbnail(guild.iconURL({ dynamic: true }) || 'https://i.imgur.com/AfFp7pu.png') 
          .addField('📌 Guild Info', `**Name:** ${guild.name}\n**ID:** \`${guild.id}\``, false)
          .addField('👤 User Info', `**ID:** \`${targetUser.id}\`\n**Nickname:** ${member.nickname || 'None'}\n**Joined:** <t:${Math.floor(member.joinedTimestamp / 1000)}:F>`, false)
          .addField('🎭 Roles & Status', `**Roles:** ${roles}\n**Owner:** ${isOwner}\n**Admin:** ${isAdmin}\n**Booster:** ${isBooster}`, false)
          .setFooter(`Page ${embeds.length + 1}`, botClient.user.displayAvatarURL())
          .setTimestamp();

        embeds.push(embed);
      }

      if (embeds.length === 0) {
        return message.channel.send('❌ The user is not in any shared servers.');
      }

      let page = 0;
      const row = new MessageActionRow().addComponents(
        new MessageButton().setCustomId('prev').setLabel('⬅️ Previous').setStyle('PRIMARY').setDisabled(true),
        new MessageButton().setCustomId('next').setLabel('➡️ Next').setStyle('PRIMARY').setDisabled(embeds.length === 1)
      );

      const botMsg = await message.channel.send({ embeds: [embeds[page]], components: [row] });

      // Set up timeout reference
      let deleteTimeout;

      const resetTimeout = () => {
        clearTimeout(deleteTimeout);
        deleteTimeout = setTimeout(async () => {
          try {
            await botMsg.delete();
          } catch (err) {
            console.error('Failed to delete message:', err);
          }
        }, 60000); // 60 seconds
      };

      resetTimeout(); // Start initial timeout

      const filter = i => i.user.id === message.author.id && i.message.id === botMsg.id;
      const collector = botMsg.createMessageComponentCollector({ filter, time: 60000 });

      collector.on('collect', async interaction => {
        await interaction.deferUpdate();
        if (interaction.customId === 'prev') page--;
        else if (interaction.customId === 'next') page++;

        const newRow = new MessageActionRow().addComponents(
          new MessageButton().setCustomId('prev').setLabel('⬅️ Previous').setStyle('PRIMARY').setDisabled(page === 0),
          new MessageButton().setCustomId('next').setLabel('➡️ Next').setStyle('PRIMARY').setDisabled(page === embeds.length - 1)
        );

        await botMsg.edit({ embeds: [embeds[page]], components: [newRow] });
        resetTimeout(); // Restart timeout after interaction
      });

      collector.on('end', () => {
        clearTimeout(deleteTimeout); // Stop timeout when collector ends
        botMsg.edit({ components: [] }).catch(() => {});
      });

    } catch (err) {
      console.error('❌ Error:', err);
      message.channel.send('❌ An error occurred while processing the command.');
    }
  }

  else if (cmd === topmaCommand) {
    // topma command
    await message.channel.send('🎧 Generating voice stats image...');
  
    try {
        const { createCanvas, loadImage } = require('canvas');
        const guildsData = [];
      
        for (const guild of userClient.guilds.cache.values()) {
            let voiceMembers = new Set();
          
            const voiceChannels = guild.channels.cache.filter(ch => ch.type === 'GUILD_VOICE');
          
            for (const channel of voiceChannels.values()) {
                channel.members.forEach(member => {
                    if (!member.user.bot) {
                        voiceMembers.add(member.id);
                    }
                });
            }
          
            if (voiceMembers.size > 0) {
                guildsData.push({
                    name: guild.name,
                    count: voiceMembers.size,
                    icon: guild.iconURL({ format: 'png', size: 256 }) || 'https://i.imgur.com/AfFp7pu.png'
                });
            }
        }
      
        // Sort by voice member count descending
        guildsData.sort((a, b) => b.count - a.count);
      
        // Take top 10
        const top10 = guildsData.slice(0, 10);
      
        if (top10.length === 0) {
            return message.channel.send('❌ No servers found with active voice users.');
        }
      
        // Canvas setup
        const canvasWidth = 900;
        const rowHeight = 100;
        const headerHeight = 180;
        const footerHeight = 50;
        const canvasHeight = headerHeight + (top10.length * rowHeight) + footerHeight;
        
        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');
        
        // Create background with galaxy effect
        ctx.fillStyle = '#0a0a18';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        // Draw stars
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 200; i++) {
            const x = Math.random() * canvasWidth;
            const y = Math.random() * canvasHeight;
            const radius = Math.random() * 1.5;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Draw nebula effect
        const nebula = ctx.createRadialGradient(
            canvasWidth / 2, 
            headerHeight / 3, 
            50,
            canvasWidth / 2, 
            headerHeight / 3, 
            400
        );
        nebula.addColorStop(0, 'rgba(105, 90, 166, 0.8)');
        nebula.addColorStop(1, 'rgba(10, 10, 24, 0)');
        ctx.fillStyle = nebula;
        ctx.beginPath();
        ctx.arc(canvasWidth / 2, headerHeight / 3, 400, 0, Math.PI * 2);
        ctx.fill();
        
        // Header with glowing text
        ctx.shadowColor = '#8f94fb';
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 50px "Arial"';
        ctx.textAlign = 'center';
        ctx.fillText("TOP VOICE MA", canvasWidth/2, 80);
        
        ctx.font = 'bold 36px "Arial"';
        ctx.fillText("made by Yumeko", canvasWidth/2, 130);
        
        // Remove shadow for other elements
        ctx.shadowBlur = 0;
        
        // Create header decoration
        ctx.strokeStyle = '#8f94fb';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(canvasWidth/2 - 200, 150);
        ctx.lineTo(canvasWidth/2 - 50, 150);
        ctx.moveTo(canvasWidth/2 + 200, 150);
        ctx.lineTo(canvasWidth/2 + 50, 150);
        ctx.stroke();
        
        // Server entries with animated gradient effect
        let y = headerHeight;
        
        for (let i = 0; i < top10.length; i++) {
            const guild = top10[i];
            
            // Create entry background with gradient
            const entryGradient = ctx.createLinearGradient(0, y, 0, y + rowHeight);
            entryGradient.addColorStop(0, 'rgba(79, 84, 200, 0.2)');
            entryGradient.addColorStop(1, 'rgba(10, 10, 24, 0)');
            ctx.fillStyle = entryGradient;
            ctx.fillRect(0, y, canvasWidth, rowHeight);
            
            // Rank badge with special design for top 3
            const rankX = 80;
            const rankY = y + rowHeight/2;
            const rankRadius = 35;
            
            // Special badges for top 3
            if (i < 3) {
                const rankColors = [
                    ['#FFD700', '#D4AF37'], // Gold
                    ['#C0C0C0', '#A9A9A9'], // Silver
                    ['#CD7F32', '#8C6B46']  // Bronze
                ];
                
                const rankGradient = ctx.createRadialGradient(
                    rankX, rankY, 0,
                    rankX, rankY, rankRadius
                );
                rankGradient.addColorStop(0, rankColors[i][0]);
                rankGradient.addColorStop(1, rankColors[i][1]);
                
                ctx.beginPath();
                ctx.arc(rankX, rankY, rankRadius, 0, Math.PI * 2);
                ctx.fillStyle = rankGradient;
                ctx.fill();
                
                // Add shine effect
                ctx.beginPath();
                ctx.arc(rankX - rankRadius/3, rankY - rankRadius/3, rankRadius/3, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.fill();
            } else {
                // Standard badge for others
                const rankGradient = ctx.createRadialGradient(
                    rankX, rankY, 0,
                    rankX, rankY, rankRadius
                );
                rankGradient.addColorStop(0, '#8f94fb');
                rankGradient.addColorStop(1, '#4e54c8');
                
                ctx.beginPath();
                ctx.arc(rankX, rankY, rankRadius, 0, Math.PI * 2);
                ctx.fillStyle = rankGradient;
                ctx.fill();
            }
            
            // Rank number
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 26px "Arial"';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`#${i+1}`, rankX, rankY);
            
            // Server icon with border
            try {
                const icon = await loadImage(guild.icon);
                const iconSize = 70;
                const iconX = 160;
                const iconY = y + (rowHeight - iconSize)/2;
                
                // Draw circular border
                ctx.beginPath();
                ctx.arc(iconX + iconSize/2, iconY + iconSize/2, iconSize/2 + 3, 0, Math.PI * 2);
                ctx.fillStyle = '#4e54c8';
                ctx.fill();
                
                // Circular mask
                ctx.save();
                ctx.beginPath();
                ctx.arc(iconX + iconSize/2, iconY + iconSize/2, iconSize/2, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                
                // Draw icon
                ctx.drawImage(icon, iconX, iconY, iconSize, iconSize);
                ctx.restore();
            } catch (err) {
                console.error('Error loading server icon:', err);
                // Draw placeholder
                ctx.fillStyle = '#4e54c8';
                ctx.beginPath();
                ctx.arc(160 + 35, y + 50, 35, 0, Math.PI * 2);
                ctx.fill();
            }
            
            // Server name with gradient
            const nameGradient = ctx.createLinearGradient(250, y, 250, y + rowHeight);
            nameGradient.addColorStop(0, '#ffffff');
            nameGradient.addColorStop(0.7, '#8f94fb');
            
            ctx.fillStyle = nameGradient;
            ctx.font = 'bold 30px "Arial"';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            
            // Truncate long server names
            let displayName = guild.name;
            const maxLength = 25;
            if (displayName.length > maxLength) {
                displayName = displayName.substring(0, maxLength) + '...';
            }
            
            ctx.fillText(displayName, 250, y + rowHeight/2);
            
            // Voice count - REMOVED ICON, JUST NUMBER
            ctx.fillStyle = '#8f94fb';
            ctx.font = 'bold 36px "Arial"';
            ctx.textAlign = 'right';
            ctx.fillText(`${guild.count}`, canvasWidth - 70, y + rowHeight/2);
            
            // Separator with glow effect
            if (i < top10.length - 1) {
                ctx.shadowColor = '#8f94fb';
                ctx.shadowBlur = 5;
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(50, y + rowHeight);
                ctx.lineTo(canvasWidth - 50, y + rowHeight);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
            
            y += rowHeight;
        }
        
        // Footer
        ctx.fillStyle = 'rgba(143, 148, 251, 0.7)';
        ctx.font = 'italic 22px "Arial"';
        ctx.textAlign = 'center';
        ctx.fillText('Generated by Yumeko • Voice Activity Tracker', canvasWidth/2, canvasHeight - 25);
        
        // Convert to buffer and send
        const buffer = canvas.toBuffer('image/png');
        const attachment = new MessageAttachment(buffer, 'top_voice_ma.png');
        message.channel.send({ 
            content: '**TOP VOICE MA STATISTICS**',
            files: [attachment] 
        });
      
    } catch (err) {
        console.error('❌ Error generating voice stats image:', err);
        message.channel.send('❌ An error occurred while generating the voice stats image.');
    }
}
});
