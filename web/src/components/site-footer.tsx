import Image from "next/image";

const quotes = [
  { text: "Float like a butterfly, sting like a bee.", author: "Muhammad Ali" },
  { text: "I hated every minute of training, but I said, don't quit. Suffer now and live the rest of your life as a champion.", author: "Muhammad Ali" },
  { text: "It isn't the mountains ahead to climb that wear you out; it's the pebble in your shoe.", author: "Muhammad Ali" },
  { text: "He who is not courageous enough to take risks will accomplish nothing in life.", author: "Muhammad Ali" },
  { text: "I've failed over and over and over again in my life. And that is why I succeed.", author: "Michael Jordan" },
  { text: "Some people want it to happen, some wish it would happen, others make it happen.", author: "Michael Jordan" },
  { text: "My attitude is that if you push me towards something that you think is a weakness, then I will turn that perceived weakness into a strength.", author: "Michael Jordan" },
  { text: "I can accept failure, everyone fails at something. But I can't accept not trying.", author: "Michael Jordan" },
  { text: "I've dreamed of this since I was a little girl. I had the talent, and I had the opportunity, and I had the will.", author: "Serena Williams" },
  { text: "I don't like to lose -- at anything -- yet I've grown most not from victories, but setbacks.", author: "Serena Williams" },
  { text: "A champion is defined not by their wins but by how they can recover when they fall.", author: "Serena Williams" },
  { text: "I really think a champion is defined not by their wins but by how they can recover when they fall.", author: "Serena Williams" },
  { text: "The most important thing is to try and inspire people so that they can be great in whatever they want to do.", author: "Kobe Bryant" },
  { text: "Everything negative -- pressure, challenges -- is all an opportunity for me to rise.", author: "Kobe Bryant" },
  { text: "The moment you give up is the moment you let someone else win.", author: "Kobe Bryant" },
  { text: "I don't want to be the next Michael Jordan, I only want to be Kobe Bryant.", author: "Kobe Bryant" },
  { text: "Rest at the end, not in the middle.", author: "Kobe Bryant" },
  { text: "Winners never quit and quitters never win.", author: "Vince Lombardi" },
  { text: "It's not whether you get knocked down, it's whether you get up.", author: "Vince Lombardi" },
  { text: "Perfection is not attainable, but if we chase perfection we can catch excellence.", author: "Vince Lombardi" },
  { text: "The only place success comes before work is in the dictionary.", author: "Vince Lombardi" },
  { text: "The difference between a successful person and others is not a lack of strength, not a lack of knowledge, but rather a lack of will.", author: "Vince Lombardi" },
  { text: "I'm not going to Harvard, but the people that work for me did.", author: "Tom Brady" },
  { text: "I didn't come this far to only come this far.", author: "Tom Brady" },
  { text: "You wanna know which ring is my favorite? The next one.", author: "Tom Brady" },
  { text: "To me, if you're trying to impress a girl, get a piano. Don't get a guitar. Everybody's got a guitar.", author: "Tom Brady" },
  { text: "If you don't believe you can, then you'll never be able to.", author: "Tom Brady" },
  { text: "The backbone of success is hard work, determination, good planning, and perseverance.", author: "Mia Hamm" },
  { text: "I am building a fire, and every day I train, I add more fuel. At just the right moment, I light the match.", author: "Mia Hamm" },
  { text: "Somewhere behind the athlete you've become and the hours of practice is a little girl who fell in love with the game.", author: "Mia Hamm" },
  { text: "You miss 100 percent of the shots you never take.", author: "Wayne Gretzky" },
  { text: "A good hockey player plays where the puck is. A great hockey player plays where the puck is going to be.", author: "Wayne Gretzky" },
  { text: "Procrastination is one of the most common and deadliest of diseases and its toll on success and happiness is heavy.", author: "Wayne Gretzky" },
  { text: "Do you know what my favorite part of the game is? The opportunity to play.", author: "Mike Singletary" },
  { text: "Hard work beats talent when talent doesn't work hard.", author: "Tim Notke" },
  { text: "It's hard to beat a person who never gives up.", author: "Babe Ruth" },
  { text: "You can't put a limit on anything. The more you dream, the farther you get.", author: "Michael Phelps" },
  { text: "There may be people that have more talent than you, but there's no excuse for anyone to work harder than you do.", author: "Derek Jeter" },
  { text: "Set your goals high, and don't stop till you get there.", author: "Bo Jackson" },
  { text: "If something stands between you and your success, move it. Never be denied.", author: "Dwayne Johnson" },
  { text: "The principle is competing against yourself. It's about self-improvement, about being better than you were the day before.", author: "Steve Young" },
  { text: "The harder the battle, the sweeter the victory.", author: "Les Brown" },
  { text: "You have to expect things of yourself before you can do them.", author: "Michael Jordan" },
  { text: "Age is no barrier. It's a limitation you put on your mind.", author: "Jackie Joyner-Kersee" },
  { text: "What makes something special is not just what you have to gain, but what you feel there is to lose.", author: "Andre Agassi" },
  { text: "The five S's of sports training are: stamina, speed, strength, skill, and spirit; but the greatest of these is spirit.", author: "Ken Doherty" },
  { text: "Never let the fear of striking out keep you from playing the game.", author: "Babe Ruth" },
  { text: "Make each day your masterpiece.", author: "John Wooden" },
  { text: "The pain you feel today will be the strength you feel tomorrow.", author: "Arnold Schwarzenegger" },
  { text: "Strength does not come from winning. Your struggles develop your strengths.", author: "Arnold Schwarzenegger" },
];

function getDailyQuote() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  return quotes[dayOfYear % quotes.length];
}

export function SiteFooter() {
  const quote = getDailyQuote();

  return (
    <footer className="border-t border-border/30 mt-12">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 flex flex-col items-center gap-3 text-center">
        <div className="flex items-center gap-2 opacity-40">
          <Image
            src="/m2logo.png"
            alt="M2"
            width={20}
            height={20}
            className="rounded-sm"
          />
          <span className="text-xs font-medium">M2 Performance &amp; Therapy</span>
        </div>
        <p className="text-xs text-muted-foreground/60 max-w-md italic">
          &ldquo;{quote.text}&rdquo; <span className="not-italic">&mdash; {quote.author}</span>
        </p>
      </div>
    </footer>
  );
}
