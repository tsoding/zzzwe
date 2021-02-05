class V2 {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    add(that) {
        return new V2(this.x + that.x, this.y + that.y);
    }

    sub(that) {
        return new V2(this.x - that.x, this.y - that.y);
    }

    scale(s) {
        return new V2(this.x * s, this.y * s);
    }

    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }
}

const speed = 1000;
const radius = 69;

const directionMap = {
    'KeyS': new V2(0, 1.0),
    'KeyW': new V2(0, -1.0),
    'KeyA': new V2(-1.0, 0),
    'KeyD': new V2(1.0, 0)
};


class TutorialPopup {
    constructor(text) {
        this.alpha = 0.0;
        this.dalpha = 0.0;
        this.text = text;
    }

    update(dt) {
        this.alpha += this.dalpha * dt;

        if (this.dalpha < 0.0 && this.alpha <= 0.0) {
            this.dalpha = 0.0;
            this.alpha = 0.0;
        } else if (this.dalpha > 0.0 && this.alpha >= 1.0) {
            this.dalpha = 0.0;
            this.alpha = 1.0;
        }
    }

    render(context) {
        const width = context.canvas.width;
        const height = context.canvas.height;

        context.fillStyle = `rgba(255, 255, 255, ${this.alpha})`;
        context.font = "30px LexendMega";
        context.textAlign = "center";
        context.fillText(this.text, width / 2, height / 2);
    }

    fadeIn() {
        this.dalpha = 1.0;
    }

    fadeOut() {
        this.dalpha = -1.0;
    }
}

class Game {
    constructor() {
        this.pos = new V2(radius + 10, radius + 10);
        this.pressedKeys = new Set();
        this.popup = new TutorialPopup("WASD to move around");
        this.popup.fadeIn();
        this.player_moved_learnt_how_to_move = false;
    }

    update(dt) {
        let vel = new V2(0, 0);
        for (let key of this.pressedKeys) {
            if (key in directionMap) {
                vel = vel.add(directionMap[key].scale(speed));
            }
        }

        if (!this.player_moved_learnt_how_to_move && vel.length() > 0.0) {
            this.player_moved_learnt_how_to_move = true;
            this.popup.fadeOut();
        }

        this.pos = this.pos.add(vel.scale(dt));

        this.popup.update(dt);
    }

    render(context) {
        const width = context.canvas.width;
        const height = context.canvas.height;

        context.clearRect(0, 0, width, height);
        fillCircle(context, this.pos, radius, "red");

        this.popup.render(context);
    }

    keyDown(event) {
        this.pressedKeys.add(event.code);
    }

    keyUp(event) {
        this.pressedKeys.delete(event.code);
    }
}

function fillCircle(context, center, radius, color = "green") {
    context.beginPath();
    context.arc(center.x, center.y, radius, 0, 2 * Math.PI, false);
    context.fillStyle = color;
    context.fill();
}

(() => {
    const canvas = document.getElementById("game");
    const context = canvas.getContext("2d");

    const game = new Game();

    let start;
    function step(timestamp) {
        if (start === undefined) {
            start = timestamp;
        }
        const dt = (timestamp - start) * 0.001;
        start = timestamp;

        const width = window.innerWidth;
        const height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;

        game.update(dt);
        game.render(context);

        window.requestAnimationFrame(step);
    }

    window.requestAnimationFrame(step);

    document.addEventListener('keydown', event => {
        game.keyDown(event);
    });

    document.addEventListener('keyup', event => {
        game.keyUp(event);
    });
})();
